import { NextResponse, type NextRequest } from 'next/server';
import { loadNewsSearch } from '@/backend/loaders/news';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { newsSearchRateLimitPolicy } from '@/backend/config/rate-limiter';
import { getClientIp } from '@/backend/transport/http';
import { NO_STORE } from '@/backend/transport/cache-policy';
import { toNextResponse } from '@/backend/transport/http-result';
import { newsSearchQuerySchema, sanitizeNewsQuery } from '@/shared/contracts/news';

/**
 * Story suggestions for the news search combobox.
 *
 * Anonymous by design, so the input is bounded before it reaches the database
 * (one uncached query per call) and the caller is throttled per IP. A blank
 * query is the client's "no search" state and answers empty without any I/O.
 *
 * The term is sanitised before the repository builds its `ilike` filter, so a
 * comma or quote cannot reach PostgREST as filter syntax.
 */
export async function GET(request: NextRequest) {
  const parsed = newsSearchQuerySchema.safeParse({
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

  // A query of punctuation only is blank once sanitised: the same "no search"
  // answer, still without any I/O.
  const query = sanitizeNewsQuery(parsed.data.q);
  if (!query) {
    return NextResponse.json({ hits: [] }, { headers: NO_STORE });
  }

  const rateLimited = await checkRateLimitApi({
    ...newsSearchRateLimitPolicy(getClientIp(request)),
    failClosed: false,
  });
  if (rateLimited) return toNextResponse(rateLimited);

  const result = await loadNewsSearch(query);

  return NextResponse.json(result, { headers: NO_STORE });
}
