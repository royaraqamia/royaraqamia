import type { HabitRestoreInput } from '@/shared/contracts/habitflow';
import { request } from '@/frontend/transport/http';
import {
  PermanentSyncError,
  type SyncTransport,
} from '@/frontend/shared/local-store/sync-transport';

export {
  PermanentSyncError,
  classifySyncError,
  errorMessage,
  type SyncTransport,
} from '@/frontend/shared/local-store/sync-transport';

/**
 * One request, as the transport needs it. Injected so the shared write fixtures
 * (`shared/fixtures/offline-writes/habitflow.json`) can assert the request each
 * intent becomes without a socket, and so the app's transport can be held to the
 * same mapping.
 */
export type SyncSend = (path: string, init: { method: string; body?: string }) => Promise<unknown>;

const httpSend: SyncSend = (path, init) => request(path, init);

/** The real transport: replays intents against the existing HabitFlow endpoints. */
export function createHttpSyncTransport(send: SyncSend = httpSend): SyncTransport {
  return {
    async send(entry) {
      switch (entry.type) {
        case 'habit.create':
          await send('/habitflow/api/habits', {
            method: 'POST',
            body: JSON.stringify(entry.payload),
          });
          return;
        case 'habit.update':
          await send('/habitflow/api/habits', {
            method: 'PUT',
            body: JSON.stringify(entry.payload),
          });
          return;
        case 'habit.delete': {
          const { id, updatedAt } = entry.payload as { id: string; updatedAt?: string };
          await send(`/habitflow/api/habits?id=${encodeURIComponent(id)}`, {
            method: 'DELETE',
            body: JSON.stringify({ updatedAt }),
          });
          return;
        }
        case 'log.toggle':
          await send('/habitflow/api/logs', {
            method: 'POST',
            body: JSON.stringify(entry.payload),
          });
          return;
        case 'log.kind':
          await send('/habitflow/api/logs/kind', {
            method: 'POST',
            body: JSON.stringify(entry.payload),
          });
          return;
        case 'log.note':
          await send('/habitflow/api/logs/note', {
            method: 'POST',
            body: JSON.stringify(entry.payload),
          });
          return;
        case 'backup.restore':
          await send('/habitflow/api/backup', {
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
