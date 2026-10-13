import type {
  PushSubscriptionRecord,
  PushSubscriptionRepository,
} from '@/backend/repositories/push/push-subscriptions-repository';
import type { PushPayload } from '@/shared/contracts/push';
import { logger } from '@/backend/shared/logger';
import {
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_RETRY_DELAY_MS,
  MAX_SEND_ATTEMPTS,
  isTransientSendError,
  mapWithConcurrency,
  sleep,
} from '@/backend/services/push/dispatch';

const TTL_SECONDS = 86400;

export interface WebPushSendOptions {
  TTL?: number;
  urgency?: 'high' | 'normal' | 'low';
}

export interface PushWebPushError {
  statusCode?: number;
}

export interface WebPushAdapter {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
    options?: WebPushSendOptions
  ): Promise<unknown>;
}

export interface PushServiceOptions {
  repository: PushSubscriptionRepository;
  enabled: boolean;
  vapid: { publicKey?: string; privateKey?: string; subject?: string };
  allowlist?: string[];
  maxConcurrency?: number;
  adapter?: WebPushAdapter;
  retryDelayMs?: number;
}

function isEndpointAllowed(endpoint: string, allowlist: string[]): boolean {
  let host: string;
  try {
    host = new URL(endpoint).hostname.toLowerCase();
  } catch {
    return false;
  }
  return allowlist.some((entry) => {
    const trimmed = entry.trim().toLowerCase();
    if (trimmed.length === 0) return false;
    if (trimmed.startsWith('.')) {
      const base = trimmed.slice(1);
      return host === base || host.endsWith(`.${base}`);
    }
    return host === trimmed;
  });
}

/**
 * Web Push dispatch service. Sends browser push notifications via VAPID,
 * prunes dead endpoints on 404/410, and is a graceful no-op when the VAPID
 * keys are not configured (dev/local/tests). Never throws to callers.
 */
export class PushService {
  private readonly repository: PushSubscriptionRepository;
  private readonly enabled: boolean;
  private readonly vapid: NonNullable<PushServiceOptions['vapid']>;
  private readonly allowlist: string[];
  private readonly maxConcurrency: number;
  private readonly retryDelayMs: number;
  private readonly adapter: WebPushAdapter;

  constructor(options: PushServiceOptions) {
    this.repository = options.repository;
    this.enabled = options.enabled;
    this.vapid = options.vapid;
    this.allowlist = options.allowlist ?? [];
    this.maxConcurrency = options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.adapter = options.adapter ?? {
      setVapidDetails() {},
      async sendNotification() {
        throw new Error('PushService requires a configured web-push adapter');
      },
    };

    if (this.enabled) {
      const { publicKey, privateKey, subject } = this.vapid;
      if (publicKey && privateKey && subject) {
        this.adapter.setVapidDetails(subject, publicKey, privateKey);
      }
    }
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.enabled) return;
    try {
      const subscriptions = await this.repository.findByUserId(userId);
      await this.dispatch(subscriptions, payload);
    } catch (error) {
      logger.error('Failed to dispatch push notifications for user', {
        userId,
        error: String(error),
      });
    }
  }

  async sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
    if (!this.enabled || userIds.length === 0) return;
    try {
      const subscriptions = await this.repository.findForUsers(userIds);
      await this.dispatch(subscriptions, payload);
    } catch (error) {
      logger.error('Failed to dispatch push notifications for users', {
        count: userIds.length,
        error: String(error),
      });
    }
  }

  private async dispatch(subscriptions: PushSubscriptionRecord[], payload: PushPayload) {
    const allowed = subscriptions.filter((subscription) => {
      if (isEndpointAllowed(subscription.endpoint, this.allowlist)) return true;
      logger.warn('Dropping push subscription with disallowed endpoint host', {
        endpoint: subscription.endpoint,
      });
      return false;
    });

    await mapWithConcurrency(allowed, this.maxConcurrency, async (subscription) => {
      await this.sendWithRetry(subscription, payload);
    });
  }

  private async sendWithRetry(subscription: PushSubscriptionRecord, payload: PushPayload) {
    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt += 1) {
      try {
        await this.adapter.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(payload),
          { TTL: TTL_SECONDS, urgency: 'high' }
        );
        // Liveness marker for the stale-subscription sweep; a touch failure
        // must never turn a delivered push into a reported failure.
        await this.repository.touch(subscription.endpoint).catch(() => undefined);
        return;
      } catch (error) {
        const status = (error as PushWebPushError).statusCode;
        if (status === 404 || status === 410) {
          await this.pruneSubscription(subscription, status);
          return;
        }
        const transient = isTransientSendError(error);
        if (!transient || attempt === MAX_SEND_ATTEMPTS) {
          logger.warn('Failed to send push notification', {
            endpoint: subscription.endpoint,
            attempt,
            statusCode: status ?? null,
            error: String(error),
          });
          return;
        }
        await sleep(this.retryDelayMs * 2 ** (attempt - 1));
      }
    }
  }

  private async pruneSubscription(subscription: PushSubscriptionRecord, status: number) {
    logger.warn('Pruning dead push subscription', {
      endpoint: subscription.endpoint,
      status,
    });
    try {
      await this.repository.removeEndpoint(subscription.endpoint);
    } catch (pruneError) {
      logger.error('Failed to prune dead push subscription', {
        endpoint: subscription.endpoint,
        error: String(pruneError),
      });
    }
  }
}
