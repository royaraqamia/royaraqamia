import type { SpendtrackLocalStore } from '@/frontend/api/spendtrack/local-store';
import { getSyncSnapshot } from '@/frontend/api/spendtrack';

/**
 * The server half of SpendTrack's reconciliation, as a plain function
 * (ADR-0060).
 *
 * Two callers, one implementation: the surface pulls with it on mount, focus,
 * reconnect and a Realtime hint, and the background tier pulls with it when
 * nobody is looking (`refresh-products.ts`). The cursor lives in the store, so
 * both callers ask for "what changed since last time" through the same path, and
 * the store only advances that cursor past rows it actually applied (#313).
 *
 * Returns how many rows the server sent, which is all a refresh can report.
 */
export async function pullSpendtrackData(store: SpendtrackLocalStore): Promise<number> {
  const since = await store.getSyncCursor();
  const snapshot = await getSyncSnapshot(since);
  await store.applySyncSnapshot(snapshot);
  return (
    snapshot.categories.length +
    snapshot.expenses.length +
    snapshot.budgets.length +
    snapshot.recurring.length
  );
}
