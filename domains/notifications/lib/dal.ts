import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createSupabaseNotificationRepository } from '@/domains/notifications/infrastructure/supabase-repository';
import { createNotificationService } from '@/domains/notifications/services/notification-service';
import type { Notification } from '@/domains/notifications/domain/entities';

export const getNotifications = cache(async (userId: string): Promise<Notification[]> => {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const repo = createSupabaseNotificationRepository(supabase);
  const service = createNotificationService(repo);
  return service.getNotifications(userId);
});

export const getUnreadCount = cache(async (userId: string): Promise<number> => {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const repo = createSupabaseNotificationRepository(supabase);
  const service = createNotificationService(repo);
  return service.getUnreadCount(userId);
});
