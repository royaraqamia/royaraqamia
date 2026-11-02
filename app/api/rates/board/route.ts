import { getRatesBoard } from '@/backend/controllers/rates';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * The rates board, for the app (#658).
 *
 * The page reads the same board through `loadRatesBoard`; this route is that
 * read as a body, so the app's converter is fed by the numbers a visitor sees in
 * the browser rather than by a second interpretation of the database.
 */
export async function GET() {
  return toNextResponse(await getRatesBoard());
}
