import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { appPerfRateLimitPolicy } from '@/backend/config/rate-limiter';
import { createAppPerfService } from '@/backend/config/observability';
import { logger } from '@/backend/shared/logger';
import { AppPerfReportSchema } from '@/shared/contracts/app-perf';

/**
 * The launch and tap beacon (#487): one record per launch that paints owned
 * rows and one per local mutation's tap → paint, plus one vitals record per page
 * life. It carries a platform tag, the cold/warm flag and the durations — no
 * URL, no user, no session, no client id — so the line is safe to grep and to
 * keep, exactly like `/api/offline-serve` (ADR-0074).
 *
 * It has two sinks since #1885: the log line stays for a live tail and for a
 * handler's own diagnosis, and the row in `perf_samples` is what a report quotes
 * after the container's 30 MB of stdout has been overwritten (ADR-0228). The
 * row is best-effort: a database that refuses the write drops the sample and
 * still answers 200, because the client never waits for this beacon.
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
  } else if (report.kind === 'vitals') {
    logger.info('[app-perf]', {
      version: report.version,
      kind: report.kind,
      platform: report.platform,
      lcpMs: report.lcpMs,
      cls: report.cls,
      inpMs: report.inpMs,
      ttfbMs: report.ttfbMs,
    });
  } else {
    logger.info('[app-perf]', {
      version: report.version,
      kind: report.kind,
      platform: report.platform,
      paintMs: report.paintMs,
    });
  }

  // The row is what a report quotes (#1885), and it is droppable: the client
  // does not await this answer, and the repository seam has already logged the
  // failure, so a storage outage must not turn a 200 beacon into a 5xx.
  try {
    await createAppPerfService().record(report);
  } catch {
    /* a dropped sample, not a failed request */
  }

  return jsonResult(200, { success: true });
}
