import { NextRequest } from 'next/server';

import { runMcpCatalogAgent } from '@/backend/controllers/mcp-catalog-agent';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * The catalogue agent's door (#1293): called by
 * `.github/workflows/mcp-catalog-agent.yml` with `MCP_CATALOG_AGENT_TOKEN`.
 *
 * Only `POST` exists. A method with no export is refused by the framework, which
 * is the verb allowlist's first half; the schema's discriminated union is the
 * second.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  return toNextResponse(await runMcpCatalogAgent(req.headers, await req.text()));
}
