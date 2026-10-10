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
