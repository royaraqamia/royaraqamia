import type {
  PushSubscriptionRecord,
  PushSubscriptionRepository,
} from '@/backend/repositories/push/push-subscriptions-repository';
import type { PushPayload } from '@/shared/contracts/push';
import { logger } from '@/backend/shared/logger';

const TTL_SECONDS = 86400;
const DEFAULT_MAX_CONCURRENCY = 10;

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

export async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (index < items.length) {
      const current = index++;
      await fn(items[current]!);
    }
  });
  await Promise.all(workers);
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
  private readonly adapter: WebPushAdapter;

  constructor(options: PushServiceOptions) {
    this.repository = options.repository;
    this.enabled = options.enabled;
    this.vapid = options.vapid;
    this.allowlist = options.allowlist ?? [];
    this.maxConcurrency = options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
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
      try {
        await this.adapter.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(payload),
          { TTL: TTL_SECONDS, urgency: 'high' }
        );
      } catch (error) {
        const status = (error as PushWebPushError).statusCode;
        if (status === 404 || status === 410) {
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
        } else {
          logger.error('Failed to send push notification', {
            endpoint: subscription.endpoint,
            error: String(error),
          });
        }
      }
    });
  }
}
