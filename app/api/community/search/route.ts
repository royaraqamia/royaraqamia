import { NextResponse, type NextRequest } from 'next/server';
import { loadCommunitySearch } from '@/backend/loaders/community';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { communitySearchRateLimitPolicy } from '@/backend/config/rate-limiter';
import { getClientIp } from '@/backend/transport/http';
import { NO_STORE } from '@/backend/transport/cache-policy';
import { toNextResponse } from '@/backend/transport/http-result';
import { CommunitySearchQuerySchema } from '@/shared/contracts/community';

/**
 * People + post suggestions for the community search combobox.
 *
 * Anonymous by design, so the input is bounded before it reaches the database
 * (two uncached queries per call) and the caller is throttled per IP. A blank
 * query is the client's "no search" state and answers empty without any I/O.
 */
export async function GET(request: NextRequest) {
  const parsed = CommunitySearchQuerySchema.safeParse({
    q: request.nextUrl.searchParams.get('q') ?? '',
  });
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? 'عبارة البحث غير صالحة.',
      },
      { status: 400, headers: NO_STORE }
    );
  }

  const query = parsed.data.q;
  if (!query) {
    return NextResponse.json({ people: [], posts: [] }, { headers: NO_STORE });
  }

  const rateLimited = await checkRateLimitApi({
    ...communitySearchRateLimitPolicy(getClientIp(request)),
    failClosed: false,
  });
  if (rateLimited) return toNextResponse(rateLimited);

  const result = await loadCommunitySearch(query);

  return NextResponse.json(result, { headers: NO_STORE });
}
