import type { SyncStatus } from '@/frontend/api/habitflow/sync-engine';
import type { OutboxEntry } from '@/frontend/shared/local-store/outbox';

/**
 * What the pill draws: the engine's last status and the Outbox as the member
 * sees it. The engine's subscription wrote the status and refreshed the
 * entries together, and the store opening or closing rewrote both — so the
 * pair is one state here. The connection flag stays its own `useState`, since
 * it is independent of the account and the store.
 */
export interface HabitSyncViewState {
  status: SyncStatus;
  entries: OutboxEntry[];
}

export type HabitSyncAction =
  /** No store or no account: the engine is idle, the entries are not ours to clear. */
  | { type: 'syncIdle' }
  | { type: 'statusChanged'; status: SyncStatus }
  | { type: 'entriesLoaded'; entries: OutboxEntry[] }
  | { type: 'entriesCleared' };

export const IDLE_SYNC_STATUS: SyncStatus = {
  syncing: false,
  pending: 0,
  failed: 0,
  lastError: null,
  lastFailedType: null,
};

export function habitSyncInitialState(): HabitSyncViewState {
  return { status: IDLE_SYNC_STATUS, entries: [] };
}

export function habitSyncReducer(
  state: HabitSyncViewState,
  action: HabitSyncAction
): HabitSyncViewState {
  switch (action.type) {
    case 'syncIdle':
      return { ...state, status: IDLE_SYNC_STATUS };

    case 'statusChanged':
      return { ...state, status: action.status };

    case 'entriesLoaded':
      return { ...state, entries: action.entries };

    case 'entriesCleared':
      return { ...state, entries: [] };
  }
}
