import type { Notification } from '@/shared/contracts/notifications';
import { request } from '@/frontend/transport/http';

export async function getNotifications(): Promise<Notification[]> {
  try {
    const data = await request<{ notifications: Notification[] }>('/api/notifications');
    return data.notifications ?? [];
  } catch {
    return [];
  }
}

export async function getUnreadCount(): Promise<number> {
  try {
    const data = await request<{ count: number }>('/api/notifications/unread-count');
    return data.count ?? 0;
  } catch {
    return 0;
  }
}

export async function markAsRead(id: string) {
  try {
    await request(`/api/notifications/${id}`, { method: 'PATCH' });
  } catch {
    throw new Error('فشل تحديث الإشعار');
  }
}

export async function markAllAsRead() {
  try {
    await request('/api/notifications', { method: 'PATCH' });
  } catch {
    throw new Error('فشل تحديث الإشعارات');
  }
}

export async function deleteNotification(id: string) {
  try {
    await request(`/api/notifications/${id}`, { method: 'DELETE' });
  } catch {
    throw new Error('فشل حذف الإشعار');
  }
}
