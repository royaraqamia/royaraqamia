import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import {
  NotificationService,
  type NotificationServiceDeps,
} from '@/backend/services/notifications/notification-service';
import type { INotificationRepository } from '@/backend/repositories/notifications/notifications-repository';
import { createSupabaseNotificationRepository } from '@/backend/repositories/notifications/supabase-repository';
import { checkRateLimit } from '@/backend/clients/rate-limiter';

export function createNotificationService(
  repo: INotificationRepository,
  deps: Partial<NotificationServiceDeps> = {}
): NotificationService {
  return new NotificationService(repo, {
    checkRateLimit,
    ...deps,
  });
}

export function createSupabaseNotificationService(
  supabase: SupabaseClient<Database>
): NotificationService {
  return createNotificationService(createSupabaseNotificationRepository(supabase));
}
