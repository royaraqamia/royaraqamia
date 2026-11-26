import type { McpAppTool } from '@/backend/services/mcp/marketplace/app-tools-service';
import type { McpPermissionLevel } from '@/shared/contracts/mcp-marketplace';
import { appToolParts, type ChatAgentAction } from '@/shared/contracts/chat-agent-actions';
import { capabilityWords } from '@/backend/services/chat/app-tool-vocabulary';
import { normalize } from '@/backend/services/chat/skill-router';

/**
 * The apps we do not own, as one turn sees them (#1225, ADR-0155 decision 7).
 *
 * A turn never declares every connected server's schema: a member with ten apps
 * would pay for all of them on every message, and the model would choose worse
 * for it. So each enabled tool is scored against the member's own message and at
 * most sixteen ride along. The miss is recoverable because `find_app_tools`
 * searches the same catalog with a query the model writes, and the next round
 * declares what it found.
 *
 * **Words gate, meaning ranks (#1917).** The tools are named in English by
 * servers we do not own, and the member writes Arabic; exact word equality
 * between the two is zero, which is the failure this router had in production.
 * Two signals answer together now:
 *
 * - the capability vocabulary (`app-tool-vocabulary`) expands an Arabic word
 *   into the English words the tools use — «انشر» finds `create_deployment`;
 * - the tool's vector, when the deployment has an embedding provider, says how
 *   close its meaning is to the message, whatever language either is in.
 *
 * The vocabulary is the gate and meaning ranks, because the measurement says so:
 * across the 321 production tools, an unrelated Arabic question can score as
 * high as 0.51 by cosine while a relevant one reaches only 0.38, so a similarity
 * floor alone cannot keep an unrelated turn quiet
 * (`chat-app-tool-routing.test.ts`, ADR-0223). Meaning still decides the order,
 * and a genuinely close tool still declares without a shared word.
 *
 * Names are the model's, and they are never stored: `app_<app>_<tool>`, ASCII,
 * at most 64 characters, unique for the member. The audit row keeps
 * `app:<connectionId>:<tool>` instead, so a rename or a second member with the
 * same app cannot orphan a proposal (decision 11).
 */

/** The most remote declarations one turn carries. */
export const CHAT_APP_TOOL_LIMIT = 16;

/** The most a recovery search answers with, so one call cannot flood a round. */
export const CHAT_APP_TOOL_SEARCH_LIMIT = 8;

/**
 * The cosine at which a tool declares itself without a shared word.
 *
 * Measured, not chosen: across the pinned production catalog the 20 unrelated
 * Arabic questions reach at most 0.511, and a question close enough in meaning
 * alone reaches 0.55 and up (`chat-app-tool-routing.test.ts`).
 */
export const CHAT_APP_TOOL_SEMANTIC_FLOOR = 0.55;

/**
 * How many of a tool's description words an unrelated-sounding message must
 * reach before the description alone declares it.
 *
 * One description word is how every tool mentions its domain; two is a sentence
 * about what this tool does. A name word or the app's name declares on its own.
 */
export const CHAT_APP_TOOL_DESCRIPTION_HITS = 2;

/** A lexical score this high is a tool named outright. */
export const CHAT_APP_TOOL_LEXICAL_FULL = 12;

/** How the two signals are weighed when a tool clears both gates. */
const SEMANTIC_WEIGHT = 0.4;
const LEXICAL_WEIGHT = 0.6;

/** One remote tool, as the provider's tool declaration and the turn's map. */
export interface ChatAppToolDeclaration {
  /** What the model names: `app_<app>_<tool>`, unique for this member. */
  name: string;
  connectionId: string;
  /** The catalogue row, when the caller knows it (member-paid media lane). */
  registryName?: string;
  toolName: string;
  appName: string;
  description: string;
  readOnly: boolean;
  permissionLevel: McpPermissionLevel;
  /** The server's own schema, or the empty object a provider accepts. */
  parameters: Record<string, unknown>;
}

/** A word of a tool, lowercased and stripped of what is not one. */
const WORD = /[\p{L}\p{N}]+/gu;

function words(value: string): string[] {
  return (normalize(value).match(WORD) ?? []).filter((word) => word.length >= 2);
}

/** The key a semantic score is looked up by: one tool, one connection. */
export function appToolKey(connectionId: string, toolName: string): string {
  return `${connectionId}:${toolName}`;
}

/** A provider-safe fragment: `[a-z0-9_]`, no run of separators, no edges. */
function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** The model-visible name of one remote tool. */
export function appToolName(appName: string, toolName: string): string {
  const app = slug(appName);
  const tool = slug(toolName) || 'tool';
  // An app renamed in Arabic has no ASCII to slug: the tool's own name is the
  // part that still identifies it, and the description carries the app.
  const full = app ? `app_${app}_${tool}` : `app_${tool}`;
  // A name is a function declaration's name: 64 characters is the ceiling every
  // provider agrees on, and a truncated one still has to end on a letter.
  return full.length <= 64 ? full : full.slice(0, 64).replace(/_+$/, '');
}

/** A name no other declaration of this turn already holds. */
function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  for (let suffix = 2; ; suffix += 1) {
    const tail = `_${suffix}`;
    const candidate = `${base.slice(0, 64 - tail.length).replace(/_+$/, '')}${tail}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

/** A declaration's schema, as a provider accepts it. */
function parametersOf(tool: McpAppTool): Record<string, unknown> {
  const schema = tool.inputSchema;
  if (schema && schema.type === 'object') return schema;
  return { type: 'object', properties: {}, additionalProperties: false };
}

/**
 * Whether a connection's level lets this tool be offered to the model at all.
 *
 * `reads` is the member saying "this app may be read, never written", so a write
 * is not declared and never becomes a card either.
 */
function offersAt(level: McpPermissionLevel, readOnly: boolean): boolean {
  return level !== 'reads' || readOnly;
}

/**
 * The whole catalog as declarations, named once.
 *
 * Naming happens over the whole catalog rather than over a selection, so a tool
 * the router missed and the recovery search found keeps the name the router
 * would have given it.
 */
export function appToolDeclarations(tools: McpAppTool[]): ChatAppToolDeclaration[] {
  const ordered = [...tools].sort(
    (left, right) =>
      left.appName.localeCompare(right.appName) ||
      left.toolName.localeCompare(right.toolName) ||
      left.connectionId.localeCompare(right.connectionId)
  );

  const taken = new Set<string>();
  return ordered
    .filter((tool) => offersAt(tool.permissionLevel, tool.readOnly))
    .map((tool) => ({
      name: uniqueName(appToolName(tool.appName, tool.toolName), taken),
      connectionId: tool.connectionId,
      registryName: tool.registryName,
      toolName: tool.toolName,
      appName: tool.appName,
      description: tool.description?.trim() || tool.toolName,
      readOnly: tool.readOnly,
      permissionLevel: tool.permissionLevel,
      parameters: parametersOf(tool),
    }));
}

/** One declaration's own words, and how rare each is across this catalog. */
interface Prepared {
  declaration: ChatAppToolDeclaration;
  nameWords: string[];
  descriptionWords: Set<string>;
  appWords: string[];
}

interface PreparedCatalog {
  rows: Prepared[];
  rarity: Map<string, number>;
}

const prepared = new WeakMap<ChatAppToolDeclaration[], PreparedCatalog>();

/**
 * The catalog as words, with each word's weight.
 *
 * `log(1 + tools / tools that carry it)` is what makes «project», which is in
 * forty descriptions, worth less than «pageview», which is in four — without it
 * a question about visitors scores as a question about projects.
 */
function prepare(declarations: ChatAppToolDeclaration[]): PreparedCatalog {
  const known = prepared.get(declarations);
  if (known) return known;

  const rows = declarations.map((declaration) => ({
    declaration,
    nameWords: words(declaration.toolName.replace(/_/g, ' ')),
    descriptionWords: new Set(words(declaration.description)),
    appWords: words(declaration.appName),
  }));

  const carrying = new Map<string, number>();
  for (const row of rows) {
    for (const token of new Set([...row.nameWords, ...row.descriptionWords, ...row.appWords])) {
      carrying.set(token, (carrying.get(token) ?? 0) + 1);
    }
  }
  const rarity = new Map(
    [...carrying].map(([token, count]) => [token, Math.log(1 + rows.length / count)])
  );

  const catalog = { rows, rarity };
  prepared.set(declarations, catalog);
  return catalog;
}

/**
 * What the message answers in one tool: its score, whether the member named the
 * tool's app, and how many of the tool's own words (name, description) the
 * message reached.
 *
 * The gate is the count, not the score: a score weighted by how rare a word is
 * depends on how many tools the member has, so an absolute floor would mean a
 * different thing for two tools and for 321. "The message names something this
 * tool is about" does not move with the catalog size.
 */
function lexicalScore(
  row: Prepared,
  tokens: readonly string[],
  rarity: Map<string, number>
): { score: number; namedApp: boolean; nameHits: number; descriptionHits: number } {
  let score = 0;
  let namedApp = false;
  let nameHits = 0;
  let descriptionHits = 0;

  for (const token of tokens) {
    const weight = rarity.get(token) ?? 1;
    // The app is its own answer, not a fallback: a tool whose description
    // happens to mention the app is still one of that app's tools.
    if (row.appWords.includes(token)) {
      score += 2 * weight;
      namedApp = true;
    }
    if (row.nameWords.includes(token)) {
      score += 3 * weight;
      nameHits += 1;
    } else if (token.length >= 4 && row.nameWords.some((word) => word.startsWith(token))) {
      score += 2 * weight;
      nameHits += 1;
    } else if (row.descriptionWords.has(token)) {
      score += 0.8 * weight;
      descriptionHits += 1;
    }
  }

  return { score, namedApp, nameHits, descriptionHits };
}

/**
 * Where a turn can learn what each tool means.
 *
 * `similar` is a cosine per `appToolKey`, read from the tool vectors the connect
 * flow wrote. Absent is a deployment with no embedding provider, no vectors yet,
 * or a recovery query that could not be embedded: the router then answers on
 * vocabulary alone, which is what it did before meaning existed.
 */
export interface ChatAppToolMeaning {
  similar?: ReadonlyMap<string, number>;
}

/** The declarations that answer a query, best first, and no more than `limit`. */
function ranked(
  declarations: ChatAppToolDeclaration[],
  query: string,
  limit: number,
  meaning: ChatAppToolMeaning
): ChatAppToolDeclaration[] {
  const tokens = [...new Set(capabilityWords(query))];
  if (tokens.length === 0) return [];

  const catalog = prepare(declarations);
  const similar = meaning.similar;

  return (
    catalog.rows
      .map((row) => {
        const lexical = lexicalScore(row, tokens, catalog.rarity);
        const cosine = similar?.get(
          appToolKey(row.declaration.connectionId, row.declaration.toolName)
        );
        const semantic = cosine === undefined ? null : Math.max(0, cosine);
        return { row, lexical, semantic };
      })
      // A tool declares itself when the message names its app, names something it
      // is called, says two things it does, or means something close enough that
      // no word needed to be shared (#1917).
      .filter(
        (hit) =>
          hit.lexical.namedApp ||
          hit.lexical.nameHits > 0 ||
          hit.lexical.descriptionHits >= CHAT_APP_TOOL_DESCRIPTION_HITS ||
          (hit.semantic !== null && hit.semantic >= CHAT_APP_TOOL_SEMANTIC_FLOOR)
      )
      .map((hit) => ({
        ...hit,
        score:
          SEMANTIC_WEIGHT * (hit.semantic ?? 0) +
          LEXICAL_WEIGHT * Math.min(hit.lexical.score / CHAT_APP_TOOL_LEXICAL_FULL, 1),
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.row.declaration.appName.localeCompare(right.row.declaration.appName) ||
          left.row.declaration.toolName.localeCompare(right.row.declaration.toolName)
      )
      .slice(0, limit)
      .map((hit) => hit.row.declaration)
  );
}

/** The remote declarations this turn carries. */
export function planAppTools(
  tools: McpAppTool[],
  message: string,
  limit = CHAT_APP_TOOL_LIMIT,
  meaning: ChatAppToolMeaning = {}
): ChatAppToolDeclaration[] {
  return ranked(appToolDeclarations(tools), message, limit, meaning);
}

/**
 * The recovery path: every usable tool whose name, app or description answers a
 * query the model wrote, so a miss in the router is one call from being fixed
 * inside the same turn.
 */
export function searchAppTools(
  tools: McpAppTool[],
  query: string,
  limit = CHAT_APP_TOOL_SEARCH_LIMIT,
  meaning: ChatAppToolMeaning = {}
): ChatAppToolDeclaration[] {
  return ranked(appToolDeclarations(tools), query, limit, meaning);
}

/** One declaration as the provider reads it, with the app it belongs to named. */
export function appToolDefinition(declaration: ChatAppToolDeclaration): {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
} {
  return {
    type: 'function' as const,
    function: {
      name: declaration.name,
      // The app is part of what the model is told: the name alone
      // (`app_notion_search`) says where it lives, and the line says what it
      // does in the server's own words.
      description: `[${declaration.appName}] ${declaration.description}`,
      parameters: declaration.parameters,
    },
  };
}

/**
 * The proposals of a page, each remote one carrying the app's current name.
 *
 * Resolved at read time rather than stored with the card: a member who renames
 * an app sees the new name in their history, and a disconnected one leaves a
 * card that still says what was proposed.
 */
export function attachAppNames(
  actions: ChatAgentAction[],
  names: Map<string, string>
): ChatAgentAction[] {
  return actions.map((action) => {
    const remote = appToolParts(action.tool);
    if (!remote) return action;
    return { ...action, appName: names.get(remote.connectionId) ?? null };
  });
}
