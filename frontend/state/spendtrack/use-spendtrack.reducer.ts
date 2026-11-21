import type { Budget, Category, Expense, RecurringExpense } from '@/shared/contracts/spendtrack';
import type { SpendtrackLocalStore } from '@/frontend/api/spendtrack/local-store';
import type { SyncStatus } from '@/frontend/shared/local-store/sync-engine';
import type { LocalIdentity } from '@/frontend/shared/local-store/identity';

/** The four collections one store read hydrates. */
export interface SpendtrackRows {
  categories: Category[];
  expenses: Expense[];
  budgets: Budget[];
  recurring: RecurringExpense[];
}

export interface SpendtrackStoreReducerState {
  /**
   * The identity the store read answered, or `null` before the first read.
   * Tagged rather than a boolean so an identity change cannot paint the previous
   * account's rows while the new store opens.
   */
  readyFor: LocalIdentity | null;
  store: SpendtrackLocalStore | null;
  online: boolean;
  rows: SpendtrackRows;
  status: SyncStatus;
}

export type SpendtrackStoreAction =
  | { type: 'hydrated'; identity: LocalIdentity; store: SpendtrackLocalStore; rows: SpendtrackRows }
  | { type: 'rowsRead'; rows: SpendtrackRows }
  | { type: 'storeReleased' }
  | { type: 'onlineChanged'; online: boolean }
  | { type: 'statusChanged'; status: SyncStatus };

export const EMPTY_SPENDTRACK_STATUS: SyncStatus = {
  syncing: false,
  pending: 0,
  failed: 0,
  lastError: null,
  lastFailedType: null,
};

export const EMPTY_SPENDTRACK_ROWS: SpendtrackRows = {
  categories: [],
  expenses: [],
  budgets: [],
  recurring: [],
};

export function spendtrackStoreInitialState(): SpendtrackStoreReducerState {
  return {
    readyFor: null,
    store: null,
    // Hydration-safe: the server (Node exposes a partial `navigator`) and the
    // first client render must agree, so start "online" and read the real value
    // in an effect.
    online: true,
    rows: EMPTY_SPENDTRACK_ROWS,
    status: EMPTY_SPENDTRACK_STATUS,
  };
}

/**
 * The store's bootstrap (`readyFor`, `store`), the four collections one read
 * hydrates, and the sync status the engine publishes. Opening the store wrote
 * these separately; here the bootstrap and its first rows are one transition.
 */
export function spendtrackStoreReducer(
  state: SpendtrackStoreReducerState,
  action: SpendtrackStoreAction
): SpendtrackStoreReducerState {
  switch (action.type) {
    case 'hydrated':
      return {
        ...state,
        readyFor: action.identity,
        store: action.store,
        rows: action.rows,
      };

    case 'rowsRead':
      return { ...state, rows: action.rows };

    case 'storeReleased':
      return { ...state, store: null };

    case 'onlineChanged':
      return { ...state, online: action.online };

    case 'statusChanged':
      return { ...state, status: action.status };
  }
}
