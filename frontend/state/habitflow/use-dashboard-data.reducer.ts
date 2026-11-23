import type { SetStateAction } from 'react';
import type { Habit, HabitLog } from '@/shared/contracts/habitflow';
import type { HabitLocalStore } from '@/frontend/api/habitflow/local-store';
import type { LocalIdentity } from '@/frontend/shared/local-store/identity';

export type DashboardMode = 'supabase' | 'local';

/**
 * The surface's rows and the Local Store that owns them. Opening the store
 * wrote the store, both row lists and the identity they belong to together;
 * a refresh rewrote both lists; signing in wrote the user and the mode. The
 * four `Dispatch` setters the hook exposes are the same state, so they are
 * transitions here too, and a functional update still resolves against the
 * previous value.
 */
export interface DashboardDataState {
  habits: Habit[];
  logs: HabitLog[];
  mode: DashboardMode;
  user: unknown;
  store: HabitLocalStore | null;
  /** The identity whose rows the store read answered; `null` before it did. */
  loadedFor: LocalIdentity | null;
}

export type DashboardDataAction =
  | {
      type: 'storeOpened';
      store: HabitLocalStore;
      habits: Habit[];
      logs: HabitLog[];
      identity: LocalIdentity;
    }
  | { type: 'dataRefreshed'; habits: Habit[]; logs: HabitLog[] }
  | { type: 'userSynced'; user: unknown }
  | { type: 'habitsSet'; update: SetStateAction<Habit[]> }
  | { type: 'logsSet'; update: SetStateAction<HabitLog[]> }
  | { type: 'modeSet'; update: SetStateAction<DashboardMode> }
  | { type: 'userSet'; update: SetStateAction<unknown> };

export function dashboardDataInitialState(seed: {
  habits: Habit[];
  logs: HabitLog[];
  mode: DashboardMode;
  user: unknown;
}): DashboardDataState {
  return {
    habits: seed.habits,
    logs: seed.logs,
    mode: seed.mode,
    user: seed.user,
    store: null,
    loadedFor: null,
  };
}

/** Resolves a `Dispatch` argument against the previous value, as `useState` does. */
function resolveSet<T>(current: T, update: SetStateAction<T>): T {
  return typeof update === 'function' ? (update as (previous: T) => T)(current) : update;
}

export function dashboardDataReducer(
  state: DashboardDataState,
  action: DashboardDataAction
): DashboardDataState {
  switch (action.type) {
    case 'storeOpened':
      return {
        ...state,
        store: action.store,
        habits: action.habits,
        logs: action.logs,
        loadedFor: action.identity,
      };

    case 'dataRefreshed':
      return { ...state, habits: action.habits, logs: action.logs };

    // A signed-in user moves the surface to Supabase; a signed-out one leaves
    // the mode alone, as the `setMode` call was only made for a user.
    case 'userSynced':
      return {
        ...state,
        user: action.user,
        mode: action.user ? 'supabase' : state.mode,
      };

    case 'habitsSet':
      return { ...state, habits: resolveSet(state.habits, action.update) };

    case 'logsSet':
      return { ...state, logs: resolveSet(state.logs, action.update) };

    case 'modeSet':
      return { ...state, mode: resolveSet(state.mode, action.update) };

    case 'userSet':
      return { ...state, user: resolveSet(state.user, action.update) };
  }
}
