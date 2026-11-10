import { NextRequest } from 'next/server';

import { completeMcpConnection } from '@/backend/controllers/mcp-marketplace';
import { toNextResponse } from '@/backend/transport/http-result';

export const runtime = 'nodejs';

/**
 * Where a third party's consent page sends the member back (ADR-0155).
 *
 * The `state` in the query is the only thing that ties this request to the
 * member who started it: the callback is a GET from a stranger's origin, so the
 * row it claims is the proof, not the browser. Every outcome — success, refusal,
 * expiry, a signed-out tab — is a redirect onto the marketplace, because the
 * member is looking at a browser navigation and JSON here would be a dead end.
 */
export async function GET(req: NextRequest) {
  return toNextResponse(await completeMcpConnection(req.nextUrl.searchParams));
}
