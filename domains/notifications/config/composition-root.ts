import { createClient } from '@/lib/supabase/client';
import { createSupabaseNotificationRepository } from '@/domains/notifications/infrastructure/supabase-repository';
import { createNotificationService } from '@/domains/notifications/services/notification-service';
import type { NotificationService } from '@/domains/notifications/services/notification-service';

let service: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  if (service) return service;
  const supabase = createClient();
  const repo = createSupabaseNotificationRepository(supabase);
  service = createNotificationService(repo);
  return service;
}
