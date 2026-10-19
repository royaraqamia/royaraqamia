import type { HabitLocalStore } from '@/frontend/api/habitflow/local-store';
import { ApiClient } from '@/frontend/api/habitflow/habit-api';

/**
 * The server half of HabitFlow's reconciliation, as a plain function (ADR-0060).
 *
 * Two callers, one implementation: the surface pulls with it on mount, focus,
 * reconnect and a Realtime hint, and the background tier pulls with it when
 * nobody is looking (`refresh-products.ts`). The merge is the store's own
 * last-write-wins, pending-aware one, so a pull can never overwrite a write that
 * has not been delivered yet, and it is idempotent — a pull that arrives twice
 * costs a request, never state.
 *
 * Returns how many rows the server sent. That is all a refresh can honestly
 * report: it cannot know which of them were new.
 */
export async function pullHabitData(store: HabitLocalStore): Promise<number> {
  const data = await ApiClient.fetchSyncData();
  await store.mergeServerData(data.habits, data.logs);
  return data.habits.length + data.logs.length;
}
