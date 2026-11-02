import * as Sentry from '@sentry/nextjs';

import { createChatAttachmentSweepService } from '@/backend/config/chat';
import { isCronAuthorized } from '@/backend/shared/cron-auth';
import { NO_STORE } from '@/backend/transport/cache-policy';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';

/**
 * The daily attachment sweep: objects the bucket holds that no message claims.
 *
 * It runs on the service role because an orphan has no row and no member to
 * read it through — the one place in chats where staff-side access is the
 * point, and it never looks at a message, only at paths (ADR-0113).
 */
export async function sweepChatAttachments(headers: Headers): Promise<HttpResult> {
  if (!isCronAuthorized(headers)) {
    return jsonResult(401, { success: false, error: 'غير مصرح' }, { headers: NO_STORE });
  }

  try {
    const result = await createChatAttachmentSweepService().run();
    return jsonResult(200, { success: true, ...result }, { headers: NO_STORE });
  } catch (error) {
    Sentry.captureException(error);
    return jsonResult(
      500,
      {
        success: false,
        error: error instanceof Error ? error.message : 'تعذّر تنظيف المرفقات',
      },
      { headers: NO_STORE }
    );
  }
}
