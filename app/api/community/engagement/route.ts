import type { NextRequest } from 'next/server';
import { getPostEngagement } from '@/backend/controllers/community';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { communityEngagementRateLimitPolicy } from '@/backend/config/rate-limiter';
import { getClientIp } from '@/backend/transport/http';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * The numbers behind one page of cards (#1573).
 *
 * One request for the page rather than one per card: the set of ids is the
 * body, so it never becomes part of a URL or of a cache key. `no-store`, because
 * `liked` is about the caller.
 */
export async function POST(req: NextRequest) {
  const rateLimited = await checkRateLimitApi({
    ...communityEngagementRateLimitPolicy(getClientIp(req)),
    failClosed: false,
  });
  if (rateLimited) return toNextResponse(rateLimited);

  return toNextResponse(await getPostEngagement(await req.json().catch(() => null)));
}
