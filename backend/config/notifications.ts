import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import {
  NotificationService,
  type NotificationServiceDeps,
} from '@/backend/services/notifications/notification-service';
import type { NotificationRepository } from '@/backend/repositories/notifications/notifications-repository';
import { createSupabaseNotificationRepository } from '@/backend/repositories/notifications/supabase-repository';
import { checkRateLimit } from '@/backend/config/rate-limiter';

export function createNotificationService(
  repo: NotificationRepository,
  deps: Partial<NotificationServiceDeps> = {}
): NotificationService {
  return new NotificationService(repo, {
    checkRateLimit: (key, limit, windowMs) =>
      checkRateLimit(key, limit, windowMs, { failClosed: true }),
    ...deps,
  });
}

export function createSupabaseNotificationService(
  supabase: SupabaseClient<Database>
): NotificationService {
  return createNotificationService(createSupabaseNotificationRepository(supabase));
}
