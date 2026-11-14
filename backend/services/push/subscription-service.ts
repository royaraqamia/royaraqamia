import type {
  PushSubscriptionRepository,
  PushSubscriptionUpsertInput,
} from '@/backend/repositories/push/push-subscriptions-repository';
import { logger } from '@/backend/shared/logger';
import { DEFAULT_MAX_CONCURRENCY, mapWithConcurrency } from '@/backend/services/push/dispatch';

/**
 * How many Web Push endpoints one member may keep.
 *
 * The table is keyed by endpoint, and endpoints rotate: WNS mints a new one per
 * browser session, so a single desktop can leave a new row behind every time it
 * is reopened. Nothing bounded that column before this, which is how one member
 * ended up with dozens of dead rows that every follow tried to push to. Ten is
 * a device list, not a history.
 */
export const MAX_SUBSCRIPTIONS_PER_USER = 10;

export interface PushSubscriptionServiceOptions {
  repository: PushSubscriptionRepository;
}

/**
 * The write side of Web Push subscriptions: store this browser's endpoint, then
 * keep the member's list to a device list. Reads and dispatch belong to
 * `PushService`; this never sends anything.
 */
export class PushSubscriptionService {
  private readonly repository: PushSubscriptionRepository;

  constructor(options: PushSubscriptionServiceOptions) {
    this.repository = options.repository;
  }

  async subscribe(userId: string, input: PushSubscriptionUpsertInput): Promise<void> {
    await this.repository.upsert(userId, input);
    await this.trim(userId, input.endpoint);
  }

  /**
   * Drops the oldest rows past the cap. Best-effort on purpose: the endpoint
   * the caller just stored is already saved, so a failed trim must not turn a
   * successful subscribe into an error the client would retry.
   */
  private async trim(userId: string, currentEndpoint: string) {
    let rows;
    try {
      rows = await this.repository.findByUserId(userId);
    } catch (error) {
      logger.warn('Failed to read push subscriptions for trimming', {
        userId,
        error: String(error),
      });
      return;
    }

    const excess = rows.length - MAX_SUBSCRIPTIONS_PER_USER;
    if (excess <= 0) return;

    const oldest = rows
      .filter((row) => row.endpoint !== currentEndpoint)
      .sort((a, b) => (Date.parse(a.updatedAt) || 0) - (Date.parse(b.updatedAt) || 0))
      .slice(0, excess);

    let failed = 0;
    await mapWithConcurrency(oldest, DEFAULT_MAX_CONCURRENCY, async (row) => {
      try {
        await this.repository.removeEndpoint(row.endpoint);
      } catch {
        failed += 1;
      }
    });

    if (failed > 0) {
      logger.warn('Failed to trim old push subscriptions', { userId, failed });
    }
  }
}
