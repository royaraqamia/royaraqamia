import { NextResponse, type NextRequest } from 'next/server';
import { loadFollowingFeed } from '@/backend/loaders/following-feed';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { communitySearchRateLimitPolicy } from '@/backend/config/rate-limiter';
import { getClientIp } from '@/backend/transport/http';
import { NO_STORE } from '@/backend/transport/cache-policy';
import { toNextResponse } from '@/backend/transport/http-result';
import { COMMUNITY_PAGE_SIZE } from '@/app/community/_components/constants';
import { CommunityIndexQuerySchema } from '@/shared/contracts/community';

/**
 * The personal feed page: my posts plus my followees', one keyset page.
 *
 * `no-store`, because the answer is about the caller. The public hub keeps
 * `/api/community/index` - the same shape, cached, one document for every
 * visitor - so neither route has to guess which of the two it is being asked
 * for. Both clients read this one when a member is signed in, which is what
 * keeps the app's feed and the page's feed the same rows.
 *
 * The query and cursor are bounded here for the same reason the public route
 * bounds them: they are attacker-controlled strings, and the read is a database
 * round trip per request.
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

  const { posts, nextCursor, signedIn } = await loadFollowingFeed(
    parsed.data.cursor,
    parsed.data.q,
    COMMUNITY_PAGE_SIZE
  );

  return NextResponse.json({ posts, nextCursor, signedIn }, { headers: NO_STORE });
}
