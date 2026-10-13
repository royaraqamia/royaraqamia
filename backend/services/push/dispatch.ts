import type { PushPayload } from '@/shared/contracts/push';

/**
 * Transport-agnostic delivery contract shared by the Web Push and FCM
 * services, and the shape every notification producer actually calls.
 */
export interface PushSender {
  sendToUser(userId: string, payload: PushPayload): Promise<void>;
  sendToUsers(userIds: string[], payload: PushPayload): Promise<void>;
}

export const DEFAULT_MAX_CONCURRENCY = 10;
export const MAX_SEND_ATTEMPTS = 3;
export const DEFAULT_RETRY_DELAY_MS = 200;

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

const TRANSIENT_ERROR_PATTERNS = [
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ENOTFOUND',
  'socket hang up',
  'socket disconnected',
  'network socket',
  'TLS',
] as const;

/**
 * Retry policy for outbound push, shared by both transports: a status the
 * provider marks as "come back later" or a socket-level failure is worth
 * another attempt, anything else (a dead token, a malformed payload, a bad
 * credential) is not.
 */
export function isTransientSendError(error: unknown): boolean {
  const status = (error as { statusCode?: number }).statusCode;
  if (status && RETRYABLE_STATUS_CODES.has(status)) return true;
  const message = String(error instanceof Error ? error.message : error);
  return TRANSIENT_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `fn` over `items` with at most `limit` in flight. A fan-out to hundreds
 * of devices must not open hundreds of sockets at once, and sequential awaits
 * would stretch a reminder run past the function duration limit.
 */
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
