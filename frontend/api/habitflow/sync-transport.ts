import type { HabitRestoreInput } from '@/shared/contracts/habitflow';
import { ApiError, request } from '@/frontend/transport/http';
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

const RETRYABLE_STATUS = new Set([408, 409, 425, 429]);

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

/** The real transport: replays intents against the existing HabitFlow endpoints. */
export function createHttpSyncTransport(): SyncTransport {
  return {
    async send(entry) {
      switch (entry.type) {
        case 'habit.create':
          await request('/habitflow/api/habits', {
            method: 'POST',
            body: JSON.stringify(entry.payload),
          });
          return;
        case 'habit.update':
          await request('/habitflow/api/habits', {
            method: 'PUT',
            body: JSON.stringify(entry.payload),
          });
          return;
        case 'habit.delete': {
          const { id } = entry.payload as { id: string };
          await request(`/habitflow/api/habits?id=${encodeURIComponent(id)}`, {
            method: 'DELETE',
          });
          return;
        }
        case 'log.toggle':
          await request('/habitflow/api/logs', {
            method: 'POST',
            body: JSON.stringify(entry.payload),
          });
          return;
        case 'log.kind':
          await request('/habitflow/api/logs/kind', {
            method: 'POST',
            body: JSON.stringify(entry.payload),
          });
          return;
        case 'log.note':
          await request('/habitflow/api/logs/note', {
            method: 'POST',
            body: JSON.stringify(entry.payload),
          });
          return;
        case 'backup.restore':
          await request('/habitflow/api/backup', {
            method: 'POST',
            body: JSON.stringify(entry.payload as HabitRestoreInput),
          });
          return;
        default:
          throw new PermanentSyncError(`Unknown outbox intent type: ${entry.type}`);
      }
    },
  };
}
