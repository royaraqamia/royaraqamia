import { request } from '@/frontend/transport/http';
import {
  PermanentSyncError,
  type SyncTransport,
} from '@/frontend/shared/local-store/sync-transport';
import { BOOKMARK_INTENT, POSITION_INTENT } from '@/frontend/api/quran/local-store';

/**
 * Replays the reader's Outbox intents (ADR-0056).
 *
 * Both intents are idempotent writes against a natural key — one position per
 * reader, one Bookmark per reader per Ayah — so a replay is an upsert, and the
 * payload already carries the shape the server validates.
 */
export function createQuranHttpSyncTransport(): SyncTransport {
  return {
    async send(entry) {
      switch (entry.type) {
        case POSITION_INTENT:
          await request('/quran/api/position', {
            method: 'POST',
            body: JSON.stringify(entry.payload),
          });
          return;
        case BOOKMARK_INTENT:
          await request('/quran/api/bookmarks', {
            method: 'POST',
            body: JSON.stringify(entry.payload),
          });
          return;
        default:
          throw new PermanentSyncError(`Unknown outbox intent type: ${entry.type}`);
      }
    },
  };
}
