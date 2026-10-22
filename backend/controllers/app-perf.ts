import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { appPerfRateLimitPolicy } from '@/backend/config/rate-limiter';
import { logger } from '@/backend/shared/logger';
import { AppPerfReportSchema } from '@/shared/contracts/app-perf';

/**
 * The launch and tap beacon (#487): one record per launch that paints owned
 * rows and one per local mutation's tap → paint, written as a single Vercel log
 * line. It carries a platform tag, the cold/warm flag and the durations — no
 * URL, no user, no session, no client id — so the line is safe to grep and to
 * keep, exactly like `/api/offline-serve` (ADR-0074).
 *
 * The body is validated before the rate limit so a malformed client cannot
 * spend a bucket, and the limiter is fail-closed: a limiter outage drops a
 * sample rather than opening an unbounded write path.
 */
export async function recordAppPerf(body: unknown, ip: string): Promise<HttpResult> {
  const parsed = AppPerfReportSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResult(400, { success: false, error: 'تقرير أداء غير صالح.' });
  }

  const rateLimited = await checkRateLimitApi({
    ...appPerfRateLimitPolicy(ip),
    failClosed: true,
  });
  if (rateLimited) return rateLimited;

  const report = parsed.data;
  if (report.kind === 'launch') {
    logger.info('[app-perf]', {
      version: report.version,
      kind: report.kind,
      platform: report.platform,
      cold: report.cold,
      shellMs: report.shellMs,
      contentMs: report.contentMs,
    });
  } else {
    logger.info('[app-perf]', {
      version: report.version,
      kind: report.kind,
      platform: report.platform,
      paintMs: report.paintMs,
    });
  }

  return jsonResult(200, { success: true });
}
