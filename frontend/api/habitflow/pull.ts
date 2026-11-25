import type { HabitLocalStore } from '@/frontend/api/habitflow/local-store';
import { ApiClient } from '@/frontend/api/habitflow/habit-api';

/**
 * The server half of HabitFlow's reconciliation, as a plain function (ADR-0060).
 *
 * Two callers, one implementation: the surface pulls with it on mount, focus,
 * reconnect and a Realtime hint, and the background tier pulls with it when
 * nobody is looking (`refresh-products.ts`). The cursor lives in the store, so
 * both ask for "what changed since last time" through the same path, and the
 * store only advances it past rows it actually applied (#313, #1788). The merge
 * is the store's last-write-wins, pending-aware one, so a pull can never
 * overwrite a write that has not been delivered yet.
 *
 * Returns how many rows the server sent in this page. That is all a refresh can
 * honestly report: it cannot know which of them were new.
 */
export async function pullHabitData(store: HabitLocalStore): Promise<number> {
  const since = await store.getSyncCursor();
  const data = await ApiClient.fetchSyncData(since);
  await store.applySyncSnapshot(data);
  return data.habits.length + data.logs.length;
}
