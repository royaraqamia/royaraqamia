import { NextRequest } from 'next/server';

import { startMcpConnection } from '@/backend/controllers/mcp-marketplace';
import { mcpMarketplaceStartRateLimitPolicy } from '@/backend/config/rate-limiter';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { getClientIp } from '@/backend/transport/http';
import { toNextResponse } from '@/backend/transport/http-result';

export const runtime = 'nodejs';

/**
 * Starts an outbound connection and answers the authorize URL the member is sent
 * to (ADR-0155).
 *
 * It answers a URL rather than redirecting: the browser's own turn to leave is a
 * navigation the client makes deliberately, and a 302 from a fetch would be
 * followed by the wrong actor.
 */
export async function POST(req: NextRequest) {
  const rateLimited = await checkRateLimitApi({
    ...mcpMarketplaceStartRateLimitPolicy(getClientIp(req)),
    failClosed: true,
  });
  if (rateLimited) return toNextResponse(rateLimited);

  return toNextResponse(await startMcpConnection(req.headers, await req.text()));
}
