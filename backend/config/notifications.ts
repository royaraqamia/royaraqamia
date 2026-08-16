import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import {
  NotificationService,
  type NotificationServiceDeps,
} from '@/backend/services/notifications/notification-service';
import type {
  NotificationRepository,
  NotificationBroadcastInput,
} from '@/backend/repositories/notifications/notifications-repository';
import { createSupabaseNotificationRepository } from '@/backend/repositories/notifications/supabase-repository';
import { checkRateLimit } from '@/backend/config/rate-limiter';
import { getAdminSupabase } from '@/backend/config/supabase';
import { createPushNotifier, runAfter } from '@/backend/config/push';
import { logger } from '@/backend/shared/logger';
import { toPushUrl } from '@/shared/contracts/push';
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
  return createNotificationService(createSupabaseNotificationRepository(getAdminSupabase()), {
    findAllUserIds: async () => {
      const { data } = await getAdminSupabase().from('users').select('id');
      return (data ?? []).map((row) => row.id);
    },
  });
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
  const pushNotifier = createPushNotifier();
  return async (input) => {
    try {
      const created = await service.create(input);
      runAfter(() =>
        pushNotifier.sendToUser(input.user_id, {
          title: input.title,
          body: input.body,
          url: toPushUrl(input.type, input.metadata),
          type: input.type,
          notificationId: created?.id,
        })
      );
    } catch (error) {
      logger.error(`Failed to create ${input.type} notification for user [${input.user_id}]`, {
        error: String(error),
      });
    }
  };
}

export type AdminBroadcaster = (input: NotificationBroadcastInput) => Promise<number>;

/**
 * Fail-safe admin announcement broadcaster: writes one notification row per
 * user via the service role, then fans out OS-level Web Push in the
 * background. Never throws to callers.
 */
export function createAdminBroadcaster(): AdminBroadcaster {
  const service = createAdminNotificationService();
  const pushNotifier = createPushNotifier();
  return async (input) => {
    try {
      const userIds = await service.getAllUserIds();
      if (userIds.length === 0) return 0;
      const sent = await service.broadcast(input, userIds);
      runAfter(() =>
        pushNotifier.sendToUsers(userIds, {
          title: input.title,
          body: input.body,
          url: toPushUrl(input.type, input.metadata),
          type: input.type,
        })
      );
      return sent;
    } catch (error) {
      logger.error(`Failed to broadcast ${input.type} notification`, {
        error: String(error),
      });
      return 0;
    }
  };
}
