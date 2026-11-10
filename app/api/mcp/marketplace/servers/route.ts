import { NextRequest } from 'next/server';

import { searchMcpCatalog } from '@/backend/controllers/mcp-catalog';
import { mcpMarketplaceSearchRateLimitPolicy } from '@/backend/config/rate-limiter';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { getClientIp } from '@/backend/transport/http';
import { toNextResponse } from '@/backend/transport/http-result';

export const runtime = 'nodejs';

/**
 * One page of the catalogue the marketplace draws (ADR-0155).
 *
 * `?q=` filters the mirror; `?cursor=` pages it. The cursor is opaque and
 * `null` is the last page, exactly as the community feed spells it, so both
 * lists page the same way.
 */
export async function GET(req: NextRequest) {
  const rateLimited = await checkRateLimitApi({
    ...mcpMarketplaceSearchRateLimitPolicy(getClientIp(req)),
    failClosed: false,
  });
  if (rateLimited) return toNextResponse(rateLimited);

  const { searchParams } = new URL(req.url);
  return toNextResponse(
    await searchMcpCatalog({
      q: searchParams.get('q'),
      cursor: searchParams.get('cursor'),
    })
  );
}
