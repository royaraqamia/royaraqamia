import type { QuranLocalStore } from '@/frontend/api/quran/local-store';
import { pullQuranSync } from '@/frontend/api/quran/sync-api';

/**
 * The server half of the Quran Reader's reconciliation, as a plain function
 * (ADR-0060).
 *
 * Two callers, one implementation: the surface pulls with it on mount, focus,
 * reconnect and a Realtime hint, and the background tier pulls with it when
 * nobody is looking (`refresh-products.ts`). The cursor lives in the store, so
 * both callers ask for "what changed since last time" through the same path, and
 * the store only advances that cursor past records it actually applied (#313).
 *
 * Returns how many rows the server sent, which is all a refresh can report.
 */
export async function pullQuranData(store: QuranLocalStore): Promise<number> {
  const since = await store.getSyncCursor();
  const snapshot = await pullQuranSync(since);
  await store.applySyncSnapshot(snapshot);
  return (snapshot.position ? 1 : 0) + snapshot.bookmarks.length;
}
