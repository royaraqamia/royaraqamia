'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/backend/transport/supabase/server';
import { createSupabaseNotificationRepository } from '@/domains/notifications/infrastructure/supabase-repository';
import { createNotificationService } from '@/domains/notifications/services/notification-service';
import type { Notification } from '@/backend/models/notifications';

export async function getNotifications(): Promise<Notification[]> {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  try {
    const repo = createSupabaseNotificationRepository(supabase);
    const service = createNotificationService(repo);
    return await service.getNotifications(user.id);
  } catch {
    return [];
  }
}

export async function getUnreadCount(): Promise<number> {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  try {
    const repo = createSupabaseNotificationRepository(supabase);
    const service = createNotificationService(repo);
    return await service.getUnreadCount(user.id);
  } catch {
    return 0;
  }
}

export async function markAsRead(id: string) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  try {
    const repo = createSupabaseNotificationRepository(supabase);
    const service = createNotificationService(repo);
    await service.markAsRead(id, user.id);
  } catch {
    throw new Error('فشل تحديث الإشعار');
  }
}

export async function markAllAsRead() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  try {
    const repo = createSupabaseNotificationRepository(supabase);
    const service = createNotificationService(repo);
    await service.markAllAsRead(user.id);
  } catch {
    throw new Error('فشل تحديث الإشعارات');
  }
}

export async function deleteNotification(id: string) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  try {
    const repo = createSupabaseNotificationRepository(supabase);
    const service = createNotificationService(repo);
    await service.delete(id, user.id);
  } catch {
    throw new Error('فشل حذف الإشعار');
  }
}
