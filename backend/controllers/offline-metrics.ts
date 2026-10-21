import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { offlineServeRateLimitPolicy } from '@/backend/config/rate-limiter';
import { logger } from '@/backend/shared/logger';
import { OfflineServeReportSchema } from '@/shared/contracts/offline-metrics';

/**
 * The field signal for `/offline` (ADR-0074, #474): one beacon per serve, sent
 * by the service worker, written as a single Vercel log line. It deliberately
 * carries no URL, no user and no client id — the door class and three tallies
 * are the whole record, so the log is safe to grep and to keep.
 *
 * The body is the only input and it is validated before the rate limit so a
 * malformed script cannot spend a bucket; the limiter is fail-closed, so a
 * limiter outage drops the signal rather than opening an unbounded write path.
 */
export async function recordOfflineServe(body: unknown, ip: string): Promise<HttpResult> {
  const parsed = OfflineServeReportSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResult(400, { success: false, error: 'تقرير غير صالح.' });
  }

  const rateLimited = await checkRateLimitApi({
    ...offlineServeRateLimitPolicy(ip),
    failClosed: true,
  });
  if (rateLimited) return rateLimited;

  const { version, door, cache } = parsed.data;
  logger.info('[offline-serve]', { version, door, cache });

  return jsonResult(200, { success: true });
}
