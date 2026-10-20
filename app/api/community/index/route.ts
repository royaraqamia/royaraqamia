import { NextResponse, type NextRequest } from 'next/server';
import { loadCommunityIndex } from '@/backend/loaders/community';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { communitySearchRateLimitPolicy } from '@/backend/config/rate-limiter';
import { getClientIp } from '@/backend/transport/http';
import { NO_STORE, PUBLIC_CACHEABLE } from '@/backend/transport/cache-policy';
import { toNextResponse } from '@/backend/transport/http-result';
import { COMMUNITY_PAGE_SIZE } from '@/app/community/_components/constants';
import { CommunityIndexQuerySchema } from '@/shared/contracts/community';

/**
 * Public feed page. `loadCommunityIndex` is wrapped in `unstable_cache` keyed on
 * its arguments, so both the query and the cursor are bounded here before they
 * can become part of that key — an unbounded attacker-controlled string would
 * grow the cache key space without limit.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const parsed = CommunityIndexQuerySchema.safeParse({
    q: params.get('q') ?? '',
    cursor: params.get('cursor') || null,
  });
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? 'مرجع التصفّح غير صالح.',
      },
      { status: 400, headers: NO_STORE }
    );
  }

  const rateLimited = await checkRateLimitApi({
    ...communitySearchRateLimitPolicy(getClientIp(request)),
    failClosed: false,
  });
  if (rateLimited) return toNextResponse(rateLimited);

  const { posts, nextCursor } = await loadCommunityIndex(
    parsed.data.cursor,
    parsed.data.q,
    COMMUNITY_PAGE_SIZE
  );

  return NextResponse.json({ posts, nextCursor }, { headers: PUBLIC_CACHEABLE });
}
