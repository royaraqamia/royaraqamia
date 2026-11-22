import * as Sentry from '@sentry/nextjs';

import { createScheduledJobHealthService } from '@/backend/config/job-health';
import { isCronAuthorized } from '@/backend/shared/cron-auth';
import { NO_STORE } from '@/backend/transport/cache-policy';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';

/**
 * The one reader of the database scheduler's run log. `scheduled-jobs.yml`
 * gates this with `--fail-with-body`, exactly as it gates the app's own jobs:
 * a stale or vanished pg_cron job turns the GitHub job red.
 */
export async function checkScheduledJobHealth(headers: Headers): Promise<HttpResult> {
  if (!isCronAuthorized(headers)) {
    return jsonResult(401, { success: false, error: 'غير مصرح' }, { headers: NO_STORE });
  }

  try {
    const report = await createScheduledJobHealthService().check();
    if (!report.healthy) {
      Sentry.captureMessage('scheduled jobs are outside their declared intervals', {
        level: 'warning',
        extra: { problems: report.problems },
      });
    }
    return jsonResult(
      report.healthy ? 200 : 503,
      { success: report.healthy, ...report },
      { headers: NO_STORE }
    );
  } catch (error) {
    Sentry.captureException(error);
    return jsonResult(
      500,
      {
        success: false,
        error: error instanceof Error ? error.message : 'تعذّر فحص المهام المجدولة',
      },
      { headers: NO_STORE }
    );
  }
}
