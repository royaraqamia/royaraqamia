import { NextResponse, type NextRequest } from 'next/server';
import { identity } from '@/backend/config/identity';
import {
  loadNewsBoard,
  NewsBoardReadError,
  parseNewsQuery,
  parseNewsView,
  type NewsViewer,
} from '@/backend/loaders/news';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { newsBoardRateLimitPolicy } from '@/backend/config/rate-limiter';
import { applyNewsCardLimit, resolveNewsCardCap } from '@/backend/services/news/card-limit';
import { getClientIp } from '@/backend/transport/http';
import { NO_STORE, PUBLIC_CACHEABLE } from '@/backend/transport/cache-policy';
import { toNextResponse } from '@/backend/transport/http-result';
import type { NewsBoard } from '@/shared/contracts/news';

/**
 * The digest `/news` reads once its document is a data-free shell (#555).
 *
 * The page used to read the board on the server from its `searchParams`, which
 * is exactly what kept it out of the precache: a document whose content depends
 * on the URL cannot be prerendered, so an offline open fell through to `/`
 * (ADR-0071). The read moved here, and the page reads it from the client, so the
 * document is the shell and the rows arrive as a read like any other.
 *
 * Two answers, two postures:
 *
 * - the shared digest, when nothing about the reader changed it — `public`, so
 *   the worker may keep it and the snapshot store may record it;
 * - a digest built from, or filtered by, the reader's own sources — `no-store`,
 *   because that answer is theirs (ADR-0079). The snapshot writer refuses it by
 *   the response's own header, which is the hard half of #555's redaction rule.
 *
 * Opening a digest is also a counted action (ADR-0093): the day's digest is
 * counted once per reader, and a reader who has opened every digest their plan
 * allows today gets an empty board with `limit` set instead of rows. A search is
 * not an open — it is the retained month, and it costs nothing.
 *
 * A board that fails to read answers 503 with `no-store` and no board payload.
 * That is what lets the page tell "no digest yet" from "we could not ask": the
 * client's failure path names the failure and leaves the saved snapshot alone,
 * where an empty 200 would have replaced it (#620).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const view = parseNewsView({ view: params.get('view') ?? undefined });
  const query = parseNewsQuery({
    q: params.get('q') ?? undefined,
    category: params.get('category') ?? undefined,
    date: params.get('date') ?? undefined,
  });

  const rateLimited = await checkRateLimitApi({
    ...newsBoardRateLimitPolicy(getClientIp(request)),
    failClosed: false,
  });
  if (rateLimited) return toNextResponse(rateLimited);

  const viewer = await resolveViewer();
  let board: NewsBoard;
  try {
    board = await loadNewsBoard(
      { q: query.q, category: query.category, date: query.date, view },
      view,
      viewer
    );
  } catch (error) {
    if (error instanceof NewsBoardReadError) {
      return NextResponse.json<{ success: false; error: string }>(
        { success: false, error: error.message },
        { status: 503, headers: NO_STORE }
      );
    }
    throw error;
  }

  // The page is always served; only the number of story cards follows the plan
  // (ADR-0093). A visitor sees one, Free five, Pro fifty.
  const cap = await resolveNewsCardCap(viewer?.userId ?? null);
  const answered = applyNewsCardLimit(board, cap, viewer === null);

  return NextResponse.json<{ board: NewsBoard }>(
    { board: answered },
    { headers: personalised(answered) || answered.cards !== null ? NO_STORE : PUBLIC_CACHEABLE }
  );
}

/**
 * The session this request already carries. Resolved here rather than inside the
 * loader so the same reader both narrows the board and is counted for opening
 * it, without a second auth round-trip.
 */
async function resolveViewer(): Promise<NewsViewer | null> {
  try {
    const { user, client } = await identity.resolveOptional();
    return user && client ? { userId: user.id, client } : null;
  } catch {
    return null;
  }
}

/**
 * Whether this answer depends on who asked: a digest that exists for them
 * (`available`, even when the shared view is being shown), their own digest
 * (`active`), or the shared one narrowed to the sources they kept.
 *
 * `available` matters on its own: a reader who opted in and has a digest for
 * the day still gets `personal.available` on the shared view, and keeping that
 * body would offer a signed-out reader on the same device a digest that is not
 * theirs (ADR-0079).
 */
function personalised(board: NewsBoard): boolean {
  return (
    board.personal?.available === true ||
    board.personal?.active === true ||
    board.preferences !== null
  );
}
