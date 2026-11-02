import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { appFailureRateLimitPolicy } from '@/backend/config/rate-limiter';
import { createAppFailureService } from '@/backend/config/observability';
import { logger } from '@/backend/shared/logger';
import { AppFailureReportRequestSchema } from '@/shared/contracts/app-failures';

/**
 * The app's own failure report (#667): a crash, an ANR or a drain that ended
 * owing work, sent by the installed APK.
 *
 * It exists because the native client is the one client with no console and no
 * page to open: a WebView that fails leaves a trace on the server, and an APK
 * that fails leaves nothing at all unless it says so. Three rules follow from
 * that and are not preferences:
 *
 * - **The report is validated before the limiter**, so a malformed client cannot
 *   spend a bucket — the same order `/api/app-perf` uses.
 * - **The limiter is fail-closed.** A crash loop that outruns the bucket loses a
 *   sample; an unbounded write path is worse, and the app's own queue keeps what
 *   it could not send.
 * - **The body carries no identity and no free text** (see the contract), so the
 *   log line below is safe to grep and to keep, like the perf and offline
 *   beacons.
 */
export async function recordAppFailure(body: unknown, ip: string): Promise<HttpResult> {
  const parsed = AppFailureReportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResult(400, { success: false, error: 'تقرير عطل غير صالح.' });
  }

  const rateLimited = await checkRateLimitApi({
    ...appFailureRateLimitPolicy(ip),
    failClosed: true,
  });
  if (rateLimited) return rateLimited;

  const report = parsed.data;
  createAppFailureService().record(report);

  logger.warn('[app-failure]', {
    version: report.version,
    kind: report.kind,
    reason: report.reason,
    signature: report.signature ?? null,
    shell: `${report.shell.name}+${report.shell.code}`,
    contracts: report.contracts,
    pending: report.pending ?? null,
    failed: report.failed ?? null,
  });

  return jsonResult(200, { success: true });
}
