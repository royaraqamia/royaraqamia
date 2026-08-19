import { requireAdminAuth } from '@/backend/middleware/admin-auth-guard';
import { createAdminBroadcaster } from '@/backend/config/notifications';
import { createAdminEmailBroadcaster } from '@/backend/config/emails';
import { BroadcastSendSchema } from '@/shared/contracts/emails';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { checkRateLimit, adminEmailBroadcastRateLimitPolicy } from '@/backend/config/rate-limiter';

export async function broadcastMessage(body: {
  title?: unknown;
  body?: unknown;
  userIds?: unknown;
  channels?: unknown;
}): Promise<HttpResult> {
  let admin: Awaited<ReturnType<typeof requireAdminAuth>>;
  try {
    admin = await requireAdminAuth();
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return jsonResult(401, { success: false, error: 'غير مصرح. يرجى تسجيل الدخول.' });
    }
    return jsonResult(403, { success: false, error: 'غير مصرح' });
  }

  const validated = BroadcastSendSchema.safeParse(body);
  if (!validated.success) {
    return jsonResult(400, {
      success: false,
      error: validated.error.issues[0]?.message ?? 'بيانات غير صالحة',
    });
  }

  const { title, body: content, userIds, channels } = validated.data;
  const withNotification = channels?.notification ?? true;
  const withEmail = channels?.email ?? false;

  if (withEmail) {
    const policy = adminEmailBroadcastRateLimitPolicy(admin.user.email ?? 'unknown');
    if (!(await checkRateLimit(policy.key, policy.limit, policy.windowMs, { failClosed: true }))) {
      return jsonResult(429, { success: false, error: policy.message });
    }
  }

  try {
    const sent = withNotification
      ? await createAdminBroadcaster()(
          { type: 'system_announcement', title, body: content || undefined },
          userIds
        )
      : 0;
    const emailsSent = withEmail
      ? await createAdminEmailBroadcaster()({ subject: title, body: content }, userIds)
      : 0;

    return jsonResult(200, { success: true, sent, emailsSent });
  } catch {
    return jsonResult(500, { success: false, error: 'فشل إرسال الإعلان' });
  }
}
