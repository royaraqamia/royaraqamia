import type { NotesLocalStore } from '@/frontend/api/notes/local-store';
import { getNotesSyncSnapshot } from '@/frontend/api/notes';

/**
 * The server half of Notes' reconciliation, as a plain function (ADR-0060).
 *
 * Two callers, one implementation: the surface pulls with it on mount, focus,
 * reconnect and a Realtime hint, and the background tier pulls with it when
 * nobody is looking (`refresh-products.ts`). The cursor lives in the store, so
 * both callers ask for "what changed since last time" through the same path, and
 * the store only advances that cursor past rows it actually applied (#313).
 *
 * Returns how many notes the server sent, which is all a refresh can report.
 */
export async function pullNotesData(store: NotesLocalStore): Promise<number> {
  const since = await store.getSyncCursor();
  const snapshot = await getNotesSyncSnapshot(since);
  await store.applySyncSnapshot(snapshot);
  return snapshot.notes.length;
}
