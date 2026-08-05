import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import {
  NotificationService,
  type NotificationServiceDeps,
} from '@/backend/services/notifications/notification-service';
import type { NotificationRepository } from '@/backend/repositories/notifications/notifications-repository';
import { createSupabaseNotificationRepository } from '@/backend/repositories/notifications/supabase-repository';
import { checkRateLimit } from '@/backend/config/rate-limiter';
import { getAdminSupabase } from '@/backend/config/supabase';
import { logger } from '@/backend/shared/logger';
import type { NotificationCreateInput } from '@/shared/contracts/notifications';

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

/**
 * Service-role-backed notification service. The `notifications` table only
 * grants INSERT to the service role (there is no auth INSERT policy), so any
 * code that PRODUCES notifications must use this path; the caller-scoped
 * client (`createSupabaseNotificationService`) can read/update/delete under RLS
 * but can never insert.
 */
export function createAdminNotificationService(): NotificationService {
  return createNotificationService(createSupabaseNotificationRepository(getAdminSupabase()));
}

/**
 * Fail-safe notification producer for feature code. Never throws: producers
 * (redirects, expense creation, publishing, ...) must never be blocked by a
 * notification delivery failure. The `notifications` table only allows INSERT
 * to the service role, so this always uses the admin client.
 */
export type NotificationProducer = (input: NotificationCreateInput) => Promise<void>;

export function createAdminNotificationProducer(): NotificationProducer {
  const service = createAdminNotificationService();
  return async (input) => {
    try {
      await service.create(input);
    } catch (error) {
      logger.error(`Failed to create ${input.type} notification for user [${input.user_id}]`, {
        error: String(error),
      });
    }
  };
}
