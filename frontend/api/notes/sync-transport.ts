import { request } from '@/frontend/transport/http';
import {
  PermanentSyncError,
  type SyncTransport,
} from '@/frontend/shared/local-store/sync-transport';

/**
 * Replays Notes Outbox intents against the sync endpoints. `clientId` is the
 * client-minted row id and the server's primary key, so a replayed write is an
 * idempotent upsert.
 */
export function createNotesHttpSyncTransport(): SyncTransport {
  return {
    async send(entry) {
      switch (entry.type) {
        case 'note.create':
          await request('/notes/api/notes', {
            method: 'POST',
            body: JSON.stringify(entry.payload),
          });
          return;
        case 'note.update': {
          const { clientId } = entry.payload as { clientId: string };
          await request(`/notes/api/notes/${encodeURIComponent(clientId)}`, {
            method: 'PATCH',
            body: JSON.stringify(entry.payload),
          });
          return;
        }
        case 'note.delete': {
          const { clientId, updatedAt } = entry.payload as {
            clientId: string;
            updatedAt?: string;
          };
          await request(`/notes/api/notes/${encodeURIComponent(clientId)}`, {
            method: 'DELETE',
            body: JSON.stringify({ updatedAt }),
          });
          return;
        }
        default:
          throw new PermanentSyncError(`Unknown outbox intent type: ${entry.type}`);
      }
    },
  };
}
