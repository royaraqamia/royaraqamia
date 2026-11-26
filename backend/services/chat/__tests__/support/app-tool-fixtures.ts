import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { appToolKey, type ChatAppToolMeaning } from '@/backend/services/chat/chat-app-tools';
import {
  appDisplayName,
  type McpAppTool,
} from '@/backend/services/mcp/marketplace/app-tools-service';
import { cosineAtIndex, decodeVectors } from '@/backend/shared/domain/skill-vectors';

/**
 * The production catalog and the pinned vectors behind #1917's acceptance.
 *
 * `app-tool-catalog.json` is the 321 enabled tools of the two live connections;
 * `app-tool-routing.json` is the Arabic questions over them, with the vectors
 * `npm run app-tools:routing` pinned from the deployment's own model. The spec
 * for the router and the seeded turn test both read this one copy, so neither
 * can measure a different catalog than the other.
 */

const FIXTURES = join(process.cwd(), 'backend', 'services', 'chat', '__tests__', 'fixtures');

interface CatalogFile {
  connections: Array<{
    id: string;
    registryName: string;
    displayName: string | null;
    permissionLevel: string;
  }>;
  tools: Array<{
    connectionId: string;
    toolName: string;
    description: string | null;
    readOnly: boolean;
  }>;
}

export interface RoutingRow {
  id: string;
  question: string;
  accept?: string[];
  vector: string;
}

export interface RoutingFile {
  version: number;
  model: string;
  dimensions: number;
  encoding: string;
  tools: string;
  toolKeys: string[];
  questions: RoutingRow[];
  controls: RoutingRow[];
}

export function productionCatalog(): McpAppTool[] {
  const file = JSON.parse(
    readFileSync(join(FIXTURES, 'app-tool-catalog.json'), 'utf8')
  ) as CatalogFile;
  const connections = new Map(file.connections.map((row) => [row.id, row] as const));

  return file.tools.flatMap((row) => {
    const connection = connections.get(row.connectionId);
    if (!connection) return [];
    return [
      {
        connectionId: row.connectionId,
        registryName: connection.registryName,
        // The name a member reads is the service's own derivation: the fixture
        // holds the registry key, and the router must never see it.
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

export function productionRouting(): RoutingFile {
  return JSON.parse(readFileSync(join(FIXTURES, 'app-tool-routing.json'), 'utf8')) as RoutingFile;
}

/** The pinned vectors, decoded once. */
export function productionVectors(routing = productionRouting()): {
  catalog: McpAppTool[];
  vectors: Int8Array;
  rowOf: Map<string, number>;
} | null {
  const catalog = productionCatalog();
  const vectors = decodeVectors(routing.tools, routing.dimensions, routing.toolKeys.length);
  if (!vectors) return null;
  return {
    catalog,
    vectors,
    rowOf: new Map(routing.toolKeys.map((key, index) => [key, index] as const)),
  };
}

/** The query vector of one question, as the turn's one embedding. */
export function queryVectorOf(row: RoutingRow, dimensions = 1024): number[] {
  const decoded = decodeVectors(row.vector, dimensions, 1);
  if (!decoded) throw new Error(`fixture row ${row.id} has no vector`);
  return Array.from(decoded);
}

/** What the turn would read from the vector store for one query. */
export function meaningOf(
  row: RoutingRow,
  routing: RoutingFile = productionRouting()
): ChatAppToolMeaning {
  const pinned = productionVectors(routing);
  if (!pinned) throw new Error('the pinned tool vectors do not decode');

  const query = queryVectorOf(row, routing.dimensions);
  const similar = new Map<string, number>();
  for (const tool of pinned.catalog) {
    const key = appToolKey(tool.connectionId, tool.toolName);
    const index = pinned.rowOf.get(key);
    if (index === undefined) continue;
    similar.set(key, cosineAtIndex(pinned.vectors, routing.dimensions, index, query));
  }
  return { similar };
}

/** The nearest rows the database would answer, from the same pinned vectors. */
export function nearestRowsOf(
  row: RoutingRow,
  routing: RoutingFile = productionRouting()
): Array<{ connectionId: string; toolName: string; similarity: number }> {
  const meaning = meaningOf(row, routing);
  const catalog = productionCatalog();
  const rows = catalog.flatMap((tool) => {
    const key = appToolKey(tool.connectionId, tool.toolName);
    const similarity = meaning.similar?.get(key);
    return similarity === undefined
      ? []
      : [{ connectionId: tool.connectionId, toolName: tool.toolName, similarity }];
  });

  return rows.sort((left, right) => right.similarity - left.similarity).slice(0, 32);
}
