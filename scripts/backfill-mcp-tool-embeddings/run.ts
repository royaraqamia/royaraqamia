import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createDefaultMcpToolEmbeddingService } from '@/backend/config/mcp';
import { createMcpMarketplaceRepository } from '@/backend/repositories/mcp/marketplace-repository';
import { appDisplayName } from '@/backend/services/mcp/marketplace/app-tools-service';

/**
 * The vectors of connections that were made before the router had any (#1917).
 *
 *   npm run mcp-tools:embed
 *
 * The connect flow embeds a connection's tools when it reads them, so the first
 * external call after a new connection is reachable without running this. This
 * is for the rows that already existed: it walks every connection, compares what
 * the vector store holds with the text the tools carry now, and embeds only the
 * difference — a second run embeds nothing, which is what makes it safe to run
 * again.
 *
 * It is a script and not a route because it is a one-off: once every connection
 * has its vectors, a connect keeps its own up to date. A member disconnecting
 * takes the vectors with the connection (the foreign key cascades).
 */

interface Report {
  connections: number;
  tools: number;
  written: number;
  missing: string[];
}

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

export async function main(argv: string[]): Promise<number> {
  loadEnvFile();

  const repository = createMcpMarketplaceRepository();
  const embeddings = createDefaultMcpToolEmbeddingService();

  const connections = await repository.listAllConnections();
  if (connections.length === 0) {
    console.log('mcp-tools: no connections to embed');
    return 0;
  }

  const report: Report = { connections: connections.length, tools: 0, written: 0, missing: [] };

  for (const connection of connections) {
    const tools = await repository.listTools(connection.id);
    report.tools += tools.length;

    const written = await embeddings.embedConnection({
      connectionId: connection.id,
      appName: appDisplayName(connection),
      tools: tools.map((tool) => ({
        name: tool.tool_name,
        description: tool.description,
        inputSchema:
          typeof tool.input_schema === 'object' && tool.input_schema !== null
            ? (tool.input_schema as Record<string, unknown>)
            : {},
        readOnly: tool.read_only,
      })),
    });
    report.written += written;

    const held = await repository.listToolEmbeddingHashes(connection.id);
    const stored = new Set(held.map((row) => row.tool_name));
    const uncovered = tools.filter((tool) => !stored.has(tool.tool_name)).length;
    console.log(
      `mcp-tools: ${appDisplayName(connection)} (${connection.id}) ` +
        `${written} embedded, ${uncovered}/${tools.length} without a vector`
    );
    if (uncovered > 0) report.missing.push(`${connection.id}: ${uncovered}`);
  }

  console.log(
    `mcp-tools: ${report.tools} tools over ${report.connections} connections, ` +
      `${report.written} embedded`
  );

  // A row without a vector is a connection that answers on vocabulary only. The
  // script reports it rather than failing: the router still works, and the
  // operator needs the count more than an exit code.
  if (report.missing.length > 0) {
    console.log(`mcp-tools: still without vectors — ${report.missing.join(', ')}`);
    console.log('mcp-tools: the provider was absent or refused; run it again when it is back');
    return argv.includes('--strict') ? 1 : 0;
  }

  return 0;
}
