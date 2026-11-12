import { getRatesBoard } from '@/backend/controllers/rates';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * The rates board, for the app (#658).
 *
 * The page reads the same board through `loadRatesBoard`; this route is that
 * read as a body, so the app's converter is fed by the numbers a visitor sees in
 * the browser rather than by a second interpretation of the database.
 *
 * `s-maxage` is for the edge, not the browser: a poller revalidates every time
 * (`max-age=0`), while Cloudflare may answer repeats for five minutes. The
 * board moves on a daily refresh, so five minutes of staleness is a number the
 * page is already willing to show (ADR-0175).
 */
export async function GET() {
  const response = toNextResponse(await getRatesBoard());
  response.headers.set(
    'Cache-Control',
    'public, max-age=0, s-maxage=300, stale-while-revalidate=600'
  );
  return response;
}
