import { ApiError } from '@/frontend/transport/http';
import type { OutboxEntry } from '@/frontend/shared/local-store/outbox';

/** A 4xx (other than the retryable few) is the server saying "not like this". */
export class PermanentSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentSyncError';
  }
}

export interface SyncTransport {
  /** Replays one intent. Throws `PermanentSyncError` or a transient error. */
  send(entry: OutboxEntry): Promise<void>;
}

/**
 * Statuses that are transient by definition even though they are 4xx. 401 is
 * here because the authenticated transports answer it when no session is
 * established — a lapsed/expiring Bearer token, not a malformed intent — so the
 * entry must back off and replay once auth is restored rather than be failed
 * permanently (ADR-0029).
 */
const RETRYABLE_STATUS = new Set([401, 408, 409, 425, 429]);

/**
 * Classifies an outbox failure into "retry forever with backoff" or "give up
 * and surface to the user" (ADR-0029). Anything without an HTTP status — a
 * dropped connection, an aborted request — is transient.
 */
export function classifySyncError(error: unknown): 'permanent' | 'transient' {
  if (error instanceof PermanentSyncError) return 'permanent';
  if (error instanceof ApiError && typeof error.status === 'number') {
    if (error.status >= 500) return 'transient';
    if (error.status >= 400 && !RETRYABLE_STATUS.has(error.status)) return 'permanent';
    return 'transient';
  }
  return 'transient';
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
