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
import { createAdminUsersService } from '@/backend/config/users';
import {
  createConcurrencyLimiter,
  type ConcurrencyLimiter,
} from '@/backend/shared/concurrency-limiter';
import { logger } from '@/backend/shared/logger';
import { toPushUrl, type PushPayload } from '@/shared/contracts/push';
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

export type NotificationAudience = 'admin' | 'all';

export interface NotificationDeliveryIntent {
  /**
   * Explicit recipients. Providing a list means recipient-based delivery —
   * including an empty list, which delivers to nobody. Omit it to resolve an
   * audience instead.
   */
  recipientIds?: string[];
  /**
   * Audience resolved when `recipientIds` is omitted. Defaults to the Admin
   * audience.
   */
  audience?: NotificationAudience;
  /** User ids removed from the resolved target set before delivery. */
  excludeUserIds?: string[];
}

/** Batched in-app delivery: one insert covering the whole target set. */
export interface NotificationDelivery {
  broadcast(input: NotificationBroadcastInput, userIds: string[]): Promise<number>;
}

/** OS-level Web Push fan-out covering the whole target set. */
export interface PushNotifier {
  sendToUsers(userIds: string[], payload: PushPayload): Promise<void>;
}

export interface NotificationFanoutDeps {
  /** Injected for tests; defaults to the service-role notification service. */
  deliver?: NotificationDelivery;
  /** Injected for tests; defaults to the real push notifier. */
  push?: PushNotifier;
  /** Admin-audience resolver. Defaults to a cached users-repository read. */
  resolveAdminIds?: () => Promise<string[]>;
  /** Resolver for explicit all-user announcements. Defaults to the users repository. */
  resolveAllUserIds?: () => Promise<string[]>;
  /** Filters explicit recipients to existing users. Defaults to the users repository. */
  filterExistingUserIds?: (ids: string[]) => Promise<string[]>;
  /** Bounds concurrent fan-outs. Defaults to a shared cap of 5. */
  limiter?: ConcurrencyLimiter;
  /** Schedules the push fan-out. Defaults to Next's `after()`. */
  schedule?: (task: () => void | Promise<void>) => void;
  /** Clock for the Admin-audience cache. */
  now?: () => number;
}

export type NotificationFanout = (
  input: NotificationBroadcastInput,
  intent?: NotificationDeliveryIntent
) => Promise<number>;

const FANOUT_CONCURRENCY = 5;
// Admin ids change rarely; a short TTL removes one query per submission when a
// burst of 100+ students applies at once, while still picking up roster changes.
const ADMIN_IDS_TTL_MS = 60_000;

/**
 * Caches the Admin audience for a short window and collapses concurrent reads
 * into one repository call, so a burst pays for the users read once.
 */
export function createAdminIdsResolver(
  loadAdminIds: () => Promise<string[]>,
  options: { ttlMs?: number; now?: () => number } = {}
): () => Promise<string[]> {
  const { ttlMs = ADMIN_IDS_TTL_MS, now = Date.now } = options;
  let cache: { ids: string[]; expiresAt: number } | null = null;
  let inFlight: Promise<string[]> | null = null;

  return async () => {
    const timestamp = now();
    if (cache && timestamp < cache.expiresAt) return cache.ids;
    if (inFlight) return inFlight;

    const pending = loadAdminIds().then((ids) => {
      cache = { ids, expiresAt: now() + ttlMs };
      return ids;
    });
    inFlight = pending;
    void pending.then(
      () => {
        inFlight = null;
      },
      () => {
        inFlight = null;
      }
    );
    return pending;
  };
}

function lazy<T>(factory: () => T): () => T {
  let value: T | null = null;
  return () => (value ??= factory());
}

function buildNotificationFanout(deps: NotificationFanoutDeps): NotificationFanout {
  const limiter = deps.limiter ?? createConcurrencyLimiter(FANOUT_CONCURRENCY);
  const schedule = deps.schedule ?? runAfter;

  const users = lazy(() => createAdminUsersService());
  const deliver = lazy<NotificationDelivery>(
    () => deps.deliver ?? createAdminNotificationService()
  );
  const push = lazy<PushNotifier>(() => deps.push ?? createPushNotifier());

  const resolveAdminIds =
    deps.resolveAdminIds ??
    createAdminIdsResolver(() => users().findAdminUserIds(), { now: deps.now });
  const resolveAllUserIds = deps.resolveAllUserIds ?? (() => users().findAllUserIds());
  const filterExistingUserIds =
    deps.filterExistingUserIds ?? ((ids: string[]) => users().findExistingUserIds(ids));

  async function resolveTargets(intent?: NotificationDeliveryIntent): Promise<string[]> {
    const explicit = intent?.recipientIds;
    const resolved =
      explicit !== undefined
        ? await filterExistingUserIds([...new Set(explicit)])
        : intent?.audience === 'all'
          ? await resolveAllUserIds()
          : await resolveAdminIds();
    const excluded = new Set(intent?.excludeUserIds ?? []);
    return [...new Set(resolved)].filter((id) => !excluded.has(id));
  }

  return (input, intent) =>
    limiter(async () => {
      try {
        const targets = await resolveTargets(intent);
        if (targets.length === 0) return 0;

        const sent = await deliver().broadcast(input, targets);
        schedule(async () => {
          try {
            await push().sendToUsers(targets, {
              title: input.title,
              body: input.body,
              url: toPushUrl(input.type, input.metadata),
              type: input.type,
            });
          } catch (error) {
            logger.error(`Failed to push ${input.type} notification`, { error: String(error) });
          }
        });
        return sent;
      } catch (error) {
        logger.error(`Failed to fan out ${input.type} notification`, { error: String(error) });
        return 0;
      }
    });
}

let sharedFanout: NotificationFanout | null = null;

/**
 * The single owner of multi-recipient notification delivery, and the one call a
 * producer makes. With no intent the notification targets the Admin audience;
 * explicit recipients make it recipient-based; an exclusion set is subtracted
 * in either case. It performs one batched repository insert and one batched
 * push fan-out, and never throws — a delivery failure is logged and reports
 * zero.
 *
 * The Admin audience, its short-lived cache and the concurrency cap all live
 * behind this interface, so a burst pays for the users read once and products
 * cannot drift into per-recipient writes. The default instance is shared so its
 * cache and cap span requests within an instance.
 */
export function createNotificationFanout(deps: NotificationFanoutDeps = {}): NotificationFanout {
  if (Object.keys(deps).length > 0) return buildNotificationFanout(deps);
  return (sharedFanout ??= buildNotificationFanout({}));
}

/**
 * The announcement and broadcast-message endpoints reach every user when no
 * explicit recipients are selected, so they ask for that audience explicitly
 * rather than relying on the fan-out's Admin default.
 */
export function announcementIntent(userIds?: string[]): NotificationDeliveryIntent {
  return userIds && userIds.length > 0 ? { recipientIds: userIds } : { audience: 'all' };
}
