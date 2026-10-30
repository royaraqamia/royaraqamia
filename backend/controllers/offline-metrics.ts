import * as Sentry from '@sentry/nextjs';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { offlineServeRateLimitPolicy } from '@/backend/config/rate-limiter';
import { logger } from '@/backend/shared/logger';
import {
  OfflineServeReportSchema,
  type OfflineServeDoor,
} from '@/shared/contracts/offline-metrics';

/**
 * The doors worth waking someone for: an ordinary page that could not answer in
 * time. The accepted doors still reach Sentry as `info` (one issue per door, so a
 * trend is visible) but never page.
 */
const OFFLINE_REGRESSION_DOORS = new Set<OfflineServeDoor>([
  'navigation-deadline',
  'online-only-deadline',
]);

/**
 * The field signal for an offline cache miss (ADR-0074, #474): one beacon per
 * miss, sent by the service worker, written as a single Vercel log line. It
 * deliberately carries no URL, no user and no client id — the door class and
 * three tallies are the whole record, so the log is safe to grep and to keep.
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
  Sentry.captureMessage('[offline-serve]', {
    level: OFFLINE_REGRESSION_DOORS.has(door) ? 'warning' : 'info',
    fingerprint: ['offline-serve', door],
    tags: { 'offline.door': door, 'offline.version': String(version) },
    extra: { cache },
  });

  return jsonResult(200, { success: true });
}
