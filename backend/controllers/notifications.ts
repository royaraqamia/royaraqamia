import { getAuthUser } from '@/backend/middleware/auth-guard';
import { requireAdminAuth } from '@/backend/middleware/admin-auth-guard';
import {
  createAdminBroadcaster,
  createSupabaseNotificationService,
} from '@/backend/config/notifications';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';

export async function listNotifications(): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) return jsonResult(200, { notifications: [] });
    const service = createSupabaseNotificationService(supabase);
    const notifications = await service.getNotifications(user.id);
    return jsonResult(200, { notifications });
  } catch {
    return jsonResult(200, { notifications: [] });
  }
}

export async function markAllNotificationsRead(): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) return jsonResult(200, { success: true });
    await createSupabaseNotificationService(supabase).markAllAsRead(user.id);
    return jsonResult(200, { success: true });
  } catch {
    return jsonResult(500, { error: 'فشل تحديث الإشعارات' });
  }
}

export async function markNotificationRead(id: string): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) return jsonResult(200, { success: true });
    await createSupabaseNotificationService(supabase).markAsRead(id, user.id);
    return jsonResult(200, { success: true });
  } catch {
    return jsonResult(500, { error: 'فشل تحديث الإشعار' });
  }
}

export async function deleteNotification(id: string): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) return jsonResult(200, { success: true });
    await createSupabaseNotificationService(supabase).delete(id, user.id);
    return jsonResult(200, { success: true });
  } catch {
    return jsonResult(500, { error: 'فشل حذف الإشعار' });
  }
}

export async function getUnreadNotificationCount(): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) return jsonResult(200, { count: 0 });
    const count = await createSupabaseNotificationService(supabase).getUnreadCount(user.id);
    return jsonResult(200, { count });
  } catch {
    return jsonResult(200, { count: 0 });
  }
}

export async function broadcastAnnouncement(body: {
  title?: unknown;
  body?: unknown;
}): Promise<HttpResult> {
  try {
    await requireAdminAuth();
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return jsonResult(401, { success: false, error: 'غير مصرح. يرجى تسجيل الدخول.' });
    }
    return jsonResult(403, { success: false, error: 'غير مصرح' });
  }

  try {
    const title = String(body.title ?? '').trim();
    const content = String(body.body ?? '').trim();
    if (!title) {
      return jsonResult(400, { success: false, error: 'العنوان مطلوب' });
    }

    const sent = await createAdminBroadcaster()({
      type: 'system_announcement',
      title,
      body: content || undefined,
    });

    return jsonResult(200, { success: true, sent });
  } catch {
    return jsonResult(500, { success: false, error: 'فشل إرسال الإعلان' });
  }
}
