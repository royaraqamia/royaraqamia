import { getAuthUser } from '@/backend/middleware/auth-guard';
import { createSupabaseNotificationService } from '@/backend/config/notifications';
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
