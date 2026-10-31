import { NextResponse, type NextRequest } from 'next/server';
import { identity } from '@/backend/config/identity';
import { loadNewsSearch } from '@/backend/loaders/news';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { newsSearchRateLimitPolicy } from '@/backend/config/rate-limiter';
import { resolveNewsCardCap } from '@/backend/services/news/card-limit';
import { getClientIp } from '@/backend/transport/http';
import { NO_STORE } from '@/backend/transport/cache-policy';
import { toNextResponse } from '@/backend/transport/http-result';
import {
  newsSearchQuerySchema,
  sanitizeNewsQuery,
  type NewsSearchSuggestions,
} from '@/shared/contracts/news';

/**
 * Story suggestions for the news search combobox.
 *
 * Public by design, so the input is bounded before it reaches the database
 * (one uncached query per call) and the caller is throttled per IP. A blank
 * query is the client's "no search" state and answers empty without any I/O.
 *
 * A suggestion row is still a story card, so the answer follows the reader's
 * Card allowance exactly as the board does (ADR-0093): a visitor sees one hit,
 * Free five, Pro fifty. Only the fields the combobox paints are returned — the
 * story itself is what the board's search serves, under the same cap.
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

  // An anonymous caller cannot ask the database for their allowance, so the
  // resolver answers the visitor number; an unreadable cap falls back to Free.
  const cap = await resolveNewsCardCap(await resolveViewerId());
  const result: NewsSearchSuggestions = await loadNewsSearch(query, cap);

  return NextResponse.json(result, { headers: NO_STORE });
}

/**
 * The session this request already carries, if any. Suggestions only need to
 * know *who* is asking, so a resolution failure is read as anonymous: the
 * remedy is a smaller cap, never a failed search.
 */
async function resolveViewerId(): Promise<string | null> {
  try {
    const { user } = await identity.resolveOptional();
    return user?.id ?? null;
  } catch {
    return null;
  }
}
