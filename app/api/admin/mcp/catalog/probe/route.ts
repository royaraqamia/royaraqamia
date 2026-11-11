import { NextRequest } from 'next/server';

import { probeMcpCatalogRow } from '@/backend/controllers/mcp-catalog';
import { toNextResponse } from '@/backend/transport/http-result';

export const runtime = 'nodejs';

/**
 * Measure one catalogue row now (ADR-0162).
 *
 * The list already probes unmeasured rows after its response, but an admin who
 * wants to approve a server should not have to reload and hope the background
 * pass reached it. The row name travels in the body for the same reason the
 * takedown endpoint takes it there: a registry name carries a slash.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return toNextResponse(await probeMcpCatalogRow(body));
}
