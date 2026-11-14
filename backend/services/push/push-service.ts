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

/**
 * The statuses that mean "this endpoint will never deliver for this key again".
 *
 * `401` is one of them: a Web Push endpoint is authenticated with the VAPID
 * key its subscription was created for, so a 401 is either a rotated endpoint
 * (WNS rotates per browser session) or a subscription minted under a key this
 * server no longer holds. The browser re-subscribes with the current key on its
 * next visit, so keeping the row only buys a doomed HTTPS attempt per fan-out;
 * pruning it is what lets the stale row go. A wrong VAPID *private* key fails
 * every endpoint at once, which the dispatch summary shows as `delivered: 0`
 * and `unauthorized: <total>` — one line, not one per endpoint.
 */
const DEAD_ENDPOINT_STATUSES = new Set([401, 404, 410]);

/** Hosts named in one summary line before it stops counting them out. */
const SUMMARY_SAMPLE_SIZE = 5;

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

type SendOutcome =
  | { kind: 'delivered'; host: string }
  | { kind: 'pruned'; host: string; status: number }
  | { kind: 'failed'; host: string; status: number | null; error: string };

/**
 * The endpoint's host, never the endpoint itself: the path and query carry the
 * subscription token, and a log line is not a reason to write it down.
 */
function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).hostname.toLowerCase();
  } catch {
    return 'invalid-endpoint';
  }
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
 * prunes endpoints the provider retires (401/404/410), and is a graceful no-op
 * when the VAPID keys are not configured (dev/local/tests). Never throws to
 * callers.
 *
 * A fan-out reports itself once. One follow to a member with a dozen rotation
 * debris endpoints used to write a dozen `Failed to send push notification`
 * lines; the same dispatch now writes a single summary with the counts and a
 * bounded sample of hosts, which is what makes a real delivery failure visible
 * instead of buried.
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
        host: endpointHost(subscription.endpoint),
      });
      return false;
    });
    if (allowed.length === 0) return;

    const outcomes: SendOutcome[] = [];
    await mapWithConcurrency(allowed, this.maxConcurrency, async (subscription) => {
      outcomes.push(await this.sendWithRetry(subscription, payload));
    });

    this.report(outcomes);
  }

  private async sendWithRetry(
    subscription: PushSubscriptionRecord,
    payload: PushPayload
  ): Promise<SendOutcome> {
    const host = endpointHost(subscription.endpoint);
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
        return { kind: 'delivered', host };
      } catch (error) {
        const status = (error as PushWebPushError).statusCode ?? null;
        if (status !== null && DEAD_ENDPOINT_STATUSES.has(status)) {
          const pruned = await this.pruneSubscription(subscription);
          if (pruned) return { kind: 'pruned', host, status };
          return { kind: 'failed', host, status, error: String(error) };
        }
        if (!isTransientSendError(error) || attempt === MAX_SEND_ATTEMPTS) {
          return { kind: 'failed', host, status, error: String(error) };
        }
        await sleep(this.retryDelayMs * 2 ** (attempt - 1));
      }
    }
    return { kind: 'failed', host, status: null, error: 'retry attempts exhausted' };
  }

  /**
   * One line for the whole fan-out: a dispatch that pruned dead rows and
   * delivered the rest is hygiene, one that could not deliver anything is a
   * failure, and the counts are what separates them.
   */
  private report(outcomes: SendOutcome[]) {
    const delivered = outcomes.filter((outcome) => outcome.kind === 'delivered').length;
    const pruned = outcomes.filter(
      (outcome): outcome is Extract<SendOutcome, { kind: 'pruned' }> => outcome.kind === 'pruned'
    );
    const failed = outcomes.filter(
      (outcome): outcome is Extract<SendOutcome, { kind: 'failed' }> => outcome.kind === 'failed'
    );
    if (pruned.length === 0 && failed.length === 0) return;

    const summary = {
      total: outcomes.length,
      delivered,
      pruned: pruned.length,
      failed: failed.length,
      unauthorized: pruned.filter((outcome) => outcome.status === 401).length,
      failures: failed
        .slice(0, SUMMARY_SAMPLE_SIZE)
        .map((outcome) => ({ host: outcome.host, status: outcome.status })),
    };

    if (failed.length > 0) {
      logger.warn('Push dispatch finished with failures', summary);
      return;
    }
    logger.warn('Push dispatch pruned dead subscriptions', summary);
  }

  private async pruneSubscription(subscription: PushSubscriptionRecord): Promise<boolean> {
    try {
      await this.repository.removeEndpoint(subscription.endpoint);
      return true;
    } catch (pruneError) {
      logger.error('Failed to prune dead push subscription', {
        host: endpointHost(subscription.endpoint),
        error: String(pruneError),
      });
      return false;
    }
  }
}
