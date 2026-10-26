import { NextResponse, type NextRequest } from 'next/server';
import { loadNewsBoard, parseNewsQuery, parseNewsView } from '@/backend/loaders/news';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { newsBoardRateLimitPolicy } from '@/backend/config/rate-limiter';
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
 * - the shared digest, when nothing about the reader changed it —?" `public`, so
 *   the worker may keep it and the snapshot store may record it;
 * - a digest built from, or filtered by, the reader's own sources —?" `no-store`,
 *   because that answer is theirs (ADR-0079). The snapshot writer refuses it by
 *   the response's own header, which is the hard half of #555's redaction rule.
 *
 * A board that fails to read is still an empty board here (`loadNewsBoard` says
 * so rather than throwing), so the page can tell "no digest yet" from "we could
 * not ask" only by whether the request resolved at all.
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

  const board = await loadNewsBoard(
    { q: query.q, category: query.category, date: query.date, view },
    view
  );

  return NextResponse.json<{ board: NewsBoard }>(
    { board },
    { headers: personalised(board) ? NO_STORE : PUBLIC_CACHEABLE }
  );
}

/**
 * Whether this answer depends on who asked: their own digest, or the shared one
 * narrowed to the sources they kept.
 */
function personalised(board: NewsBoard): boolean {
  return board.personal?.active === true || board.preferences !== null;
}
