import { getAuthUser } from '@/backend/middleware/auth-guard';
import { withAdminUser } from '@/backend/transport/admin-handler';
import {
  announcementIntent,
  createNotificationFanout,
  createSupabaseNotificationService,
} from '@/backend/config/notifications';
import { NO_STORE } from '@/backend/transport/cache-policy';
import { AnnouncementSendSchema } from '@/shared/contracts/notifications';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';

/**
 * These reads bypass the authenticated seam (`getAuthUser` is called directly,
 * and a signed-out caller gets a 200 rather than a 401), so the seam's
 * `no-store` guarantee does not reach them. Each response declares the posture
 * itself (#461): an account-scoped body is never publicly cacheable, not even
 * the anonymous 200 the background flush depends on.
 */
export async function listNotifications(): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) return jsonResult(200, { notifications: [] }, { headers: NO_STORE });
    const service = createSupabaseNotificationService(supabase);
    const notifications = await service.getNotifications(user.id);
    return jsonResult(200, { notifications }, { headers: NO_STORE });
  } catch {
    return jsonResult(500, { error: 'فشل تحميل الإشعارات' }, { headers: NO_STORE });
  }
}

/**
 * One auth resolution and one response for the shell's badge and the feed.
 * The two reads the bell used to make separately each resolved the session on
 * its own server round trip, so every page paid twice before its own content
 * could settle; the list and the count are both account-scoped and both come
 * from the same service instance here.
 */
export async function listNotificationsWithCount(): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) return jsonResult(200, { notifications: [], count: 0 }, { headers: NO_STORE });
    const service = createSupabaseNotificationService(supabase);
    const [notifications, count] = await Promise.all([
      service.getNotifications(user.id),
      service.getUnreadCount(user.id),
    ]);
    return jsonResult(200, { notifications, count }, { headers: NO_STORE });
  } catch {
    return jsonResult(500, { error: 'فشل تحميل الإشعارات' }, { headers: NO_STORE });
  }
}

export async function markAllNotificationsRead(): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) return jsonResult(200, { success: true }, { headers: NO_STORE });
    await createSupabaseNotificationService(supabase).markAllAsRead(user.id);
    return jsonResult(200, { success: true }, { headers: NO_STORE });
  } catch {
    return jsonResult(500, { error: 'فشل تحديث الإشعارات' }, { headers: NO_STORE });
  }
}

export async function markNotificationRead(id: string): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) return jsonResult(200, { success: true }, { headers: NO_STORE });
    await createSupabaseNotificationService(supabase).markAsRead(id, user.id);
    return jsonResult(200, { success: true }, { headers: NO_STORE });
  } catch {
    return jsonResult(500, { error: 'فشل تحديث الإشعار' }, { headers: NO_STORE });
  }
}

export async function deleteNotification(id: string): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) return jsonResult(200, { success: true }, { headers: NO_STORE });
    await createSupabaseNotificationService(supabase).delete(id, user.id);
    return jsonResult(200, { success: true }, { headers: NO_STORE });
  } catch {
    return jsonResult(500, { error: 'فشل حذف الإشعار' }, { headers: NO_STORE });
  }
}

export async function getUnreadNotificationCount(): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) return jsonResult(200, { count: 0 }, { headers: NO_STORE });
    const count = await createSupabaseNotificationService(supabase).getUnreadCount(user.id);
    return jsonResult(200, { count }, { headers: NO_STORE });
  } catch {
    return jsonResult(500, { error: 'فشل تحميل عدد الإشعارات' }, { headers: NO_STORE });
  }
}

export async function broadcastAnnouncement(body: {
  title?: unknown;
  body?: unknown;
  userIds?: unknown;
}): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const validated = AnnouncementSendSchema.safeParse(body);
      if (!validated.success) {
        return jsonResult(400, {
          success: false,
          error: validated.error.issues[0]?.message ?? 'بيانات غير صالحة',
        });
      }

      const { title, body: content, userIds } = validated.data;
      const sent = await createNotificationFanout()(
        {
          type: 'system_announcement',
          title,
          body: content || undefined,
        },
        announcementIntent(userIds)
      );

      return jsonResult(200, { success: true, sent });
    },
    { whenFailed: { success: false, error: 'فشل إرسال الإعلان' } }
  );
}
