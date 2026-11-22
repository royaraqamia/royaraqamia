import type { NotificationRepository } from '@/backend/repositories/notifications/notifications-repository';
import type { Notification } from '@/shared/contracts/notifications';
import { toPushUrl, type PushPayload } from '@/shared/contracts/push';
import { mapWithConcurrency, type PushSender } from '@/backend/services/push/dispatch';

const WEBHOOK_RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const WEBHOOK_CONCURRENCY = 10;

export interface PushWebhookServiceDeps {
  notifications: Pick<NotificationRepository, 'findByIds'>;
  notifier: PushSender;
  checkRateLimit: (key: string, limit: number, windowMs: number) => Promise<boolean>;
  schedule: (fn: () => void | Promise<void>) => void;
  /** Damascus day: the clock the reminder selection itself fires on. */
  dateKey: () => string;
}

export interface PushWebhookResult {
  notified: number;
}

/**
 * Turns the bell rows a DB producer just wrote into pushes. Taking notification
 * ids rather than user ids is the point: the stored row is the only writer of a
 * reminder's words, so the bell, the push and both clients cannot disagree.
 */
export class PushWebhookService {
  private readonly deps: PushWebhookServiceDeps;

  constructor(deps: PushWebhookServiceDeps) {
    this.deps = deps;
  }

  async handle(notificationIds: string[]): Promise<PushWebhookResult> {
    const rows = await this.deps.notifications.findByIds(notificationIds);
    const byId = new Map(rows.map((row) => [row.id, row]));

    // One push per user, in payload order: a member with several habits due at
    // once gets the first row's words, just as the webhook did before.
    const userIds: string[] = [];
    const byUser = new Map<string, Notification>();
    for (const id of notificationIds) {
      const row = byId.get(id);
      if (!row || byUser.has(row.user_id)) continue;
      byUser.set(row.user_id, row);
      userIds.push(row.user_id);
    }

    const day = this.deps.dateKey();
    const allowedIds: string[] = [];
    // Bounded concurrency: a reminder run can fan out to hundreds of users and
    // each dedupe check is an Upstash round-trip.
    await mapWithConcurrency(userIds, WEBHOOK_CONCURRENCY, async (userId) => {
      const allowed = await this.deps.checkRateLimit(
        `push:habit:${userId}:${day}`,
        1,
        WEBHOOK_RATE_WINDOW_MS
      );
      if (allowed) allowedIds.push(userId);
    });

    if (allowedIds.length > 0) {
      // Group users who share a payload so the notifier still reads the device
      // tokens in batches instead of opening a round-trip per user.
      const groups = new Map<string, { userIds: string[]; payload: PushPayload }>();
      for (const userId of allowedIds) {
        const row = byUser.get(userId)!;
        const payload: PushPayload = {
          title: row.title,
          body: row.body ?? undefined,
          url: toPushUrl(row.type, row.metadata),
          type: row.type,
        };
        const key = JSON.stringify([row.title, row.body, payload.url, row.type]);
        const group = groups.get(key);
        if (group) group.userIds.push(userId);
        else groups.set(key, { userIds: [userId], payload });
      }

      this.deps.schedule(() => {
        void Promise.all(
          [...groups.values()].map(({ userIds: recipients, payload }) =>
            this.deps.notifier.sendToUsers(recipients, payload)
          )
        );
      });
    }

    return { notified: allowedIds.length };
  }
}
