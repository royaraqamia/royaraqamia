import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createAiEmbeddingsClient } from '@/backend/clients/ai-embeddings';
import { env } from '@/backend/config/env';
import { appDisplayName } from '@/backend/services/mcp/marketplace/app-tools-service';
import {
  appToolKey,
  planAppTools,
  searchAppTools,
  type ChatAppToolMeaning,
} from '@/backend/services/chat/chat-app-tools';
import type { McpAppTool } from '@/backend/services/mcp/marketplace/app-tools-service';
import {
  APP_TOOL_EMBEDDING,
  appToolEmbeddingText,
} from '@/backend/shared/domain/app-tool-embeddings';
import { cosineAtIndex, decodeVectors, encodeVectors } from '@/backend/shared/domain/skill-vectors';

/**
 * The routing fixture behind #1917's acceptance criteria.
 *
 *   npm run app-tools:routing           # pin the tool and question vectors
 *   npm run app-tools:routing -- --check  # verify the file without a provider
 *
 * The catalog is a snapshot of the production rows (321 tools over two
 * connections); the questions are Arabic, drawn from what those tools do. The
 * vectors are the deployment's own model, embedded with the exact text the
 * connect flow embeds (`appToolEmbeddingText`), so the spec measures the router
 * that ships rather than a copy of it.
 *
 * `--check` needs no key and no network: it proves the pinned file still
 * describes the pinned catalog, and prints the same measurement the spec
 * asserts.
 */

const FIXTURES = join('backend', 'services', 'chat', '__tests__', 'fixtures');
const CATALOG = join(FIXTURES, 'app-tool-catalog.json');
const ROUTING = join(FIXTURES, 'app-tool-routing.json');

interface CatalogConnection {
  id: string;
  registryName: string;
  displayName: string | null;
  permissionLevel: string;
}

interface CatalogTool {
  connectionId: string;
  toolName: string;
  description: string | null;
  readOnly: boolean;
}

interface RoutingRow {
  id: string;
  question: string;
  accept?: string[];
  vector: string;
}

interface RoutingFile {
  version: 1;
  model: string;
  dimensions: number;
  encoding: 'int8';
  source: string;
  tools: string;
  toolKeys: string[];
  questions: RoutingRow[];
  controls: RoutingRow[];
}

/** The scripts run outside Next, which is what loads `.env` for the app. */
function loadEnvFile(): void {
  let raw: string;
  try {
    raw = readFileSync(join(process.cwd(), '.env'), 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    const [, key, value] = match;
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = (value ?? '').replace(/^["']|["']$/g, '');
  }
}

function readCatalog(): McpAppTool[] {
  const file = JSON.parse(readFileSync(join(process.cwd(), CATALOG), 'utf8')) as {
    connections: CatalogConnection[];
    tools: CatalogTool[];
  };
  const connections = new Map(file.connections.map((row) => [row.id, row] as const));

  return file.tools.flatMap((row) => {
    const connection = connections.get(row.connectionId);
    if (!connection) return [];
    return [
      {
        connectionId: row.connectionId,
        registryName: connection.registryName,
        appName: appDisplayName({
          display_name: connection.displayName,
          registry_name: connection.registryName,
        }),
        toolName: row.toolName,
        description: row.description,
        inputSchema: null,
        readOnly: row.readOnly,
        permissionLevel: connection.permissionLevel as McpAppTool['permissionLevel'],
      },
    ];
  });
}

function readRouting(): RoutingFile {
  return JSON.parse(readFileSync(join(process.cwd(), ROUTING), 'utf8')) as RoutingFile;
}

function fail(message: string): number {
  console.error(`app-tools: ${message}`);
  return 1;
}

/** The similarities the router reads in production, computed from the pinned vectors. */
export function meaningOf(
  catalog: McpAppTool[],
  toolVectors: Int8Array,
  dimensions: number,
  rowOf: ReadonlyMap<string, number>,
  queryVector: ArrayLike<number>
): ChatAppToolMeaning {
  const similar = new Map<string, number>();
  for (const tool of catalog) {
    const row = rowOf.get(appToolKey(tool.connectionId, tool.toolName));
    if (row === undefined) continue;
    similar.set(
      appToolKey(tool.connectionId, tool.toolName),
      cosineAtIndex(toolVectors, dimensions, row, queryVector)
    );
  }
  return { similar };
}

function queryVector(row: RoutingRow, dimensions: number): number[] | null {
  const decoded = decodeVectors(row.vector, dimensions, 1);
  return decoded ? Array.from(decoded) : null;
}

/** What the fixture proves, printed by both modes. */
function measure(catalog: McpAppTool[], file: RoutingFile): number {
  const count = file.toolKeys.length;
  const vectors = decodeVectors(file.tools, file.dimensions, count);
  if (!vectors) return fail('the pinned tool vectors do not decode');

  const rowOf = new Map(file.toolKeys.map((key, index) => [key, index] as const));

  let recovered = 0;
  let topOne = 0;
  let topThree = 0;
  const misses: string[] = [];
  for (const row of file.questions) {
    const vector = queryVector(row, file.dimensions);
    if (!vector) return fail(`question ${row.id} has no vector`);
    const planned = planAppTools(
      catalog,
      row.question,
      16,
      meaningOf(catalog, vectors, file.dimensions, rowOf, vector)
    );
    const names = planned.map((tool) => tool.toolName);
    const accept = row.accept ?? [];
    if (names.some((name) => accept.includes(name))) recovered += 1;
    else misses.push(`${row.id}: ${row.question} -> ${names.slice(0, 3).join(', ') || 'nothing'}`);
    if (names[0] !== undefined && accept.includes(names[0])) topOne += 1;
    if (names.slice(0, 3).some((name) => accept.includes(name))) topThree += 1;
  }

  let quiet = 0;
  const loud: string[] = [];
  for (const row of file.controls) {
    const vector = queryVector(row, file.dimensions);
    if (!vector) return fail(`control ${row.id} has no vector`);
    const planned = planAppTools(
      catalog,
      row.question,
      16,
      meaningOf(catalog, vectors, file.dimensions, rowOf, vector)
    );
    if (planned.length === 0) quiet += 1;
    else loud.push(`${row.id}: ${row.question} -> ${planned.length} declared`);
  }

  // The recovery path reads the same vectors: one query must find what the
  // router found, or a miss and a hit disagree (the issue's own requirement).
  let recoveredBySearch = 0;
  for (const row of file.questions) {
    const vector = queryVector(row, file.dimensions);
    if (!vector) continue;
    const found = searchAppTools(
      catalog,
      row.question,
      8,
      meaningOf(catalog, vectors, file.dimensions, rowOf, vector)
    );
    if (found.some((tool) => (row.accept ?? []).includes(tool.toolName))) recoveredBySearch += 1;
  }

  // The same questions with no vectors at all: the vocabulary's own share of
  // the result, so the record says what meaning added rather than assuming it.
  let recoveredWithoutMeaning = 0;
  let topOneWithoutMeaning = 0;
  let topThreeWithoutMeaning = 0;
  for (const row of file.questions) {
    const planned = planAppTools(catalog, row.question, 16);
    const names = planned.map((tool) => tool.toolName);
    const accept = row.accept ?? [];
    if (names.some((name) => accept.includes(name))) recoveredWithoutMeaning += 1;
    if (names[0] !== undefined && accept.includes(names[0])) topOneWithoutMeaning += 1;
    if (names.slice(0, 3).some((name) => accept.includes(name))) topThreeWithoutMeaning += 1;
  }

  console.log(
    `app-tools: ${recovered}/${file.questions.length} questions reach a correct tool, ` +
      `${quiet}/${file.controls.length} controls declare nothing, ` +
      `${recoveredBySearch}/${file.questions.length} recovered through search`
  );
  console.log(
    `app-tools: the correct tool is first for ${topOne} and in the first three for ${topThree}; ` +
      `on vocabulary alone ${recoveredWithoutMeaning}/${file.questions.length} reach one, ` +
      `first for ${topOneWithoutMeaning}, in the first three for ${topThreeWithoutMeaning}`
  );
  for (const miss of misses) console.log(`  miss  ${miss}`);
  for (const hit of loud) console.log(`  loud  ${hit}`);

  if (recovered / file.questions.length < 0.8) {
    return fail('fewer than 80% of the questions reach a correct tool');
  }
  if (quiet !== file.controls.length) {
    return fail('an unrelated question declared an app tool');
  }
  return 0;
}

function check(): number {
  const catalog = readCatalog();
  if (catalog.length === 0) return fail('the catalog snapshot is empty');

  const file = readRouting();
  if (file.version !== 1 || file.encoding !== 'int8') return fail('unknown fixture version');
  if (file.dimensions !== APP_TOOL_EMBEDDING.dimensions) {
    return fail(
      `the fixture is ${file.dimensions}-wide, the deployment writes ${APP_TOOL_EMBEDDING.dimensions}`
    );
  }
  if (file.toolKeys.length !== catalog.length) {
    return fail(
      `the fixture pins ${file.toolKeys.length} tools for a ${catalog.length}-tool catalog`
    );
  }
  if (!file.tools) return fail('the tool vectors are missing; run `npm run app-tools:routing`');

  const model = env.aiEmbeddingModel;
  if (model && file.model !== model) {
    return fail(`the fixture was built with ${file.model}, not ${model}; rebuild it`);
  }

  return measure(catalog, file);
}

async function pin(): Promise<number> {
  loadEnvFile();

  const catalog = readCatalog();
  if (catalog.length === 0) return fail('the catalog snapshot is empty');

  const client = createAiEmbeddingsClient({ dimensions: APP_TOOL_EMBEDDING.dimensions });
  if (!client) {
    return fail(
      'no embedding client: AI_EMBEDDING_MODEL, a key (AI_EMBEDDING_API_KEY or AI_CHAT_API_KEY)' +
        ' and a matching width are required'
    );
  }

  const file = readRouting();
  const questions = [...file.questions, ...file.controls];

  console.log(
    `app-tools: embedding ${catalog.length} tools and ${questions.length} questions with ${client.model}`
  );
  const toolVectors = await client.embed(
    catalog.map((tool) =>
      appToolEmbeddingText({
        appName: tool.appName,
        toolName: tool.toolName,
        description: tool.description,
      })
    ),
    new AbortController().signal
  );
  if (!toolVectors || toolVectors.length !== catalog.length) {
    return fail('the provider did not answer one vector per tool');
  }

  const questionVectors = await client.embed(
    questions.map((row) => row.question),
    new AbortController().signal
  );
  if (!questionVectors || questionVectors.length !== questions.length) {
    return fail('the provider did not answer one vector per question');
  }

  const pinned: RoutingFile = {
    ...file,
    model: client.model,
    dimensions: APP_TOOL_EMBEDDING.dimensions,
    encoding: 'int8',
    tools: encodeVectors(toolVectors),
    toolKeys: catalog.map((tool) => appToolKey(tool.connectionId, tool.toolName)),
    questions: file.questions.map((row, index) => ({
      ...row,
      vector: encodeVectors([questionVectors[index] ?? []]),
    })),
    controls: file.controls.map((row, index) => ({
      ...row,
      vector: encodeVectors([questionVectors[file.questions.length + index] ?? []]),
    })),
  };

  writeFileSync(join(process.cwd(), ROUTING), `${JSON.stringify(pinned, null, 2)}\n`, 'utf8');
  console.log(`app-tools: wrote ${ROUTING}`);

  return measure(catalog, pinned);
}

export async function main(argv: string[]): Promise<number> {
  if (argv.includes('--check')) return check();
  return pin();
}
