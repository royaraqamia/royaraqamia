import type { McpAppTool } from '@/backend/services/mcp/marketplace/app-tools-service';
import type { McpPermissionLevel } from '@/shared/contracts/mcp-marketplace';
import { appToolParts, type ChatAgentAction } from '@/shared/contracts/chat-agent-actions';

/**
 * The apps we do not own, as one turn sees them (#1225, ADR-0155 decision 7).
 *
 * A turn never declares every connected server's schema: a member with ten apps
 * would pay for all of them on every message, and the model would choose worse
 * for it. So each enabled tool is scored against the member's own words — a
 * lexical match, no model and no tokens — and at most sixteen ride along. The
 * miss is recoverable because `find_app_tools` searches the same catalog with a
 * query the model writes, and the next round declares what it found.
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

/** One remote tool, as the provider's tool declaration and the turn's map. */
export interface ChatAppToolDeclaration {
  /** What the model names: `app_<app>_<tool>`, unique for this member. */
  name: string;
  connectionId: string;
  toolName: string;
  appName: string;
  description: string;
  readOnly: boolean;
  permissionLevel: McpPermissionLevel;
  /** The server's own schema, or the empty object a provider accepts. */
  parameters: Record<string, unknown>;
}

/** A word of a message or a tool, lowercased and stripped of what is not one. */
const WORD = /[a-z0-9\u0600-\u06FF]+/g;
/** Arabic diacritics and the tatweel are decoration, not letters to match on. */
const DECORATION = /[\p{M}\u0640]/gu;

function words(value: string): string[] {
  return (value.toLowerCase().replace(DECORATION, '').match(WORD) ?? []).filter(
    (word) => word.length >= 2
  );
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
      toolName: tool.toolName,
      appName: tool.appName,
      description: tool.description?.trim() || tool.toolName,
      readOnly: tool.readOnly,
      permissionLevel: tool.permissionLevel,
      parameters: parametersOf(tool),
    }));
}

/**
 * How well one declaration answers one message.
 *
 * The app's own name is the strongest signal — a member who names an app means
 * that app — then a word of the tool's own name, then a prefix of one (an
 * inflected word still matches), then a word of its description. Zero means the
 * message never mentioned this tool, which is what keeps an unrelated question
 * from carrying any remote declaration at all.
 */
function scoreOf(declaration: ChatAppToolDeclaration, messageWords: string[]): number {
  const nameWords = words(`${declaration.toolName} ${declaration.description}`);
  const appWords = words(declaration.appName);

  let score = 0;
  for (const word of messageWords) {
    if (appWords.includes(word)) score += 4;
    if (nameWords.includes(word)) score += 3;
    else if (word.length >= 3 && nameWords.some((candidate) => candidate.startsWith(word))) {
      score += 2;
    }
  }
  return score;
}

/** The declarations that answer a message, best first, and no more than `limit`. */
function ranked(
  declarations: ChatAppToolDeclaration[],
  message: string,
  limit: number
): ChatAppToolDeclaration[] {
  const messageWords = [...new Set(words(message))];
  if (messageWords.length === 0) return [];

  return declarations
    .map((declaration) => ({ declaration, score: scoreOf(declaration, messageWords) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.declaration.appName.localeCompare(right.declaration.appName) ||
        left.declaration.toolName.localeCompare(right.declaration.toolName)
    )
    .slice(0, limit)
    .map((entry) => entry.declaration);
}

/** The remote declarations this turn carries. */
export function planAppTools(
  tools: McpAppTool[],
  message: string,
  limit = CHAT_APP_TOOL_LIMIT
): ChatAppToolDeclaration[] {
  return ranked(appToolDeclarations(tools), message, limit);
}

/**
 * The recovery path: every usable tool whose name, app or description answers a
 * query the model wrote, so a miss in the router is one call from being fixed
 * inside the same turn.
 */
export function searchAppTools(
  tools: McpAppTool[],
  query: string,
  limit = CHAT_APP_TOOL_SEARCH_LIMIT
): ChatAppToolDeclaration[] {
  return ranked(appToolDeclarations(tools), query, limit);
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
