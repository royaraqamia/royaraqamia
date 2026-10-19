import type {
  DevicePushTokenRecord,
  DevicePushTokenRepository,
} from '@/backend/repositories/push/device-push-tokens-repository';
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
import {
  isDeadTokenError,
  FCM_SYNC_WAKE,
  type FcmAdapter,
} from '@/backend/services/push/fcm-client';

export interface FcmPushServiceOptions {
  repository: DevicePushTokenRepository;
  enabled: boolean;
  adapter?: FcmAdapter;
  maxConcurrency?: number;
  retryDelayMs?: number;
}

/** Who to leave out of a wake, and why the caller's own token is one of them. */
export interface FcmWakeOptions {
  /**
   * The FCM token of the device that just wrote. A commit wakes the account's
   * *other* devices; waking the writer as well would cost it a drain to learn
   * something it already knows.
   */
  excludeToken?: string;
}

/**
 * FCM dispatch for the native shell, the counterpart of `PushService`: sends to
 * every device token a user has registered, prunes the tokens Firebase reports
 * as gone, and is a graceful no-op when the service account is not configured
 * (dev/local/tests). Never throws to callers.
 */
export class FcmPushService {
  private readonly repository: DevicePushTokenRepository;
  private readonly enabled: boolean;
  private readonly adapter: FcmAdapter;
  private readonly maxConcurrency: number;
  private readonly retryDelayMs: number;

  constructor(options: FcmPushServiceOptions) {
    this.repository = options.repository;
    this.enabled = options.enabled;
    this.maxConcurrency = options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.adapter = options.adapter ?? {
      async send() {
        throw new Error('FcmPushService requires a configured FCM adapter');
      },
      async sendData() {
        throw new Error('FcmPushService requires a configured FCM adapter');
      },
    };
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.enabled) return;
    try {
      const tokens = await this.repository.findByUserId(userId);
      await this.dispatch(tokens, payload);
    } catch (error) {
      logger.error('Failed to dispatch native push notifications for user', {
        userId,
        error: String(error),
      });
    }
  }

  async sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
    if (!this.enabled || userIds.length === 0) return;
    try {
      const tokens = await this.repository.findForUsers(userIds);
      await this.dispatch(tokens, payload);
    } catch (error) {
      logger.error('Failed to dispatch native push notifications for users', {
        count: userIds.length,
        error: String(error),
      });
    }
  }

  /**
   * Wakes the account's devices so they pull (ADR-0059, ADR-0060).
   *
   * This is the background twin of the Realtime hint: a silent, data-only,
   * high-priority message that says only "something moved" and is answered by
   * the same pull a focus event answers. It carries no work and no payload a
   * receiver could mistake for state, so a wake can only ever cost a request.
   *
   * Never throws to callers, exactly like the notification path: a wake the
   * network refused is late, never lost — the device's own floor and the next
   * foreground both still run.
   */
  async sendWakeToUser(userId: string, options: FcmWakeOptions = {}): Promise<void> {
    if (!this.enabled) return;
    try {
      const tokens = await this.repository.findByUserId(userId);
      const targets = options.excludeToken
        ? tokens.filter((record) => record.token !== options.excludeToken)
        : tokens;
      await mapWithConcurrency(targets, this.maxConcurrency, async (record) => {
        await this.sendWithRetry(record, () =>
          this.adapter.sendData(record.token, { type: FCM_SYNC_WAKE })
        );
      });
    } catch (error) {
      logger.error('Failed to wake devices for user', {
        userId,
        error: String(error),
      });
    }
  }

  private async dispatch(tokens: DevicePushTokenRecord[], payload: PushPayload) {
    await mapWithConcurrency(tokens, this.maxConcurrency, async (record) => {
      await this.sendWithRetry(record, () => this.adapter.send(record.token, payload));
    });
  }

  private async sendWithRetry(record: DevicePushTokenRecord, deliver: () => Promise<void>) {
    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt += 1) {
      try {
        await deliver();
        return;
      } catch (error) {
        if (isDeadTokenError(error)) {
          await this.pruneToken(record);
          return;
        }
        const transient = isTransientSendError(error);
        if (!transient || attempt === MAX_SEND_ATTEMPTS) {
          logger.warn('Failed to send native push notification', {
            userId: record.userId,
            attempt,
            errorCode: (error as { errorCode?: string }).errorCode ?? null,
            error: String(error),
          });
          return;
        }
        await sleep(this.retryDelayMs * 2 ** (attempt - 1));
      }
    }
  }

  private async pruneToken(record: DevicePushTokenRecord) {
    logger.warn('Pruning dead device push token', {
      userId: record.userId,
      error: 'token reported gone by FCM',
    });
    try {
      await this.repository.removeToken(record.token);
    } catch (pruneError) {
      logger.error('Failed to prune dead device push token', {
        userId: record.userId,
        error: String(pruneError),
      });
    }
  }
}
