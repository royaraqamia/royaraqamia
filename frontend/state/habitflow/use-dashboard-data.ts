import {
  useReducer,
  useEffect,
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { Habit, HabitLog } from '@/shared/contracts/habitflow';
import { HabitLocalStore } from '@/frontend/api/habitflow/local-store';
import { GUEST_IDENTITY, identityFromUser } from '@/frontend/shared/local-store/identity';
import {
  halveList,
  screenful,
  useSnapshot,
  useSnapshotRecorder,
} from '@/frontend/shared/local-store/snapshot';
import { logger } from '@/frontend/shared/logger';
import { markContent } from '@/frontend/shared/perf-marks';
import {
  dashboardDataInitialState,
  dashboardDataReducer,
  type DashboardMode,
} from '@/frontend/state/habitflow/use-dashboard-data.reducer';

/**
 * The surface's snapshot (#495): the habits and logs the list last rendered.
 *
 * The identity is resolved synchronously (#493) and the store is one connection
 * (#494), but the read is still a promise — so before it answers, this is what
 * the first frame paints.
 */
export const HABITFLOW_SNAPSHOT_ROUTE = 'habitflow';

interface DashboardSnapshot {
  habits: Habit[];
  logs: HabitLog[];
}

/** The byte budget's second pass: half the rows, and nothing once they are gone. */
function trimDashboard(data: DashboardSnapshot): DashboardSnapshot | null {
  const habits = halveList(data.habits);
  const logs = halveList(data.logs);
  return habits.length === 0 && logs.length === 0 ? null : { habits, logs };
}

/**
 * Moves anything a guest wrote before signing in into the account store
 * (ADR-0027): dedupe by client_id, LWW, and the guest intents are re-homed so
 * the work syncs under the account. Idempotent — an emptied guest store is a
 * no-op on the next open.
 */
async function claimGuestData(userStore: HabitLocalStore): Promise<void> {
  const guest = await HabitLocalStore.open(GUEST_IDENTITY);
  try {
    await userStore.claimFrom(guest);
  } finally {
    guest.close();
  }
}

export interface DashboardSeed {
  habits: Habit[];
  logs: HabitLog[];
  mode: DashboardMode;
  user: unknown;
}

export interface DashboardData {
  habits: Habit[];
  logs: HabitLog[];
  mode: DashboardMode;
  user: unknown;
  /** True once a real session exists; the Outbox only flushes for an account. */
  isSignedIn: boolean;
  /** The identity-scoped Local Store once it is open; the source of truth for rendering. */
  store: HabitLocalStore | null;
  setHabits: Dispatch<SetStateAction<Habit[]>>;
  setLogs: Dispatch<SetStateAction<HabitLog[]>>;
  setMode: Dispatch<SetStateAction<DashboardMode>>;
  setUser: Dispatch<SetStateAction<unknown>>;
  refreshData: () => Promise<void>;
  syncUser: (sessionUser: unknown) => Promise<void>;
}

function visibleHabits(habits: Habit[]): Habit[] {
  return habits.filter((habit) => !habit.archived && !habit.deletedAt);
}

function visibleLogs(logs: HabitLog[]): HabitLog[] {
  return logs.filter((log) => !log.deletedAt);
}

export function useDashboardData(seed: DashboardSeed): DashboardData {
  const [state, dispatch] = useReducer(dashboardDataReducer, seed, dashboardDataInitialState);

  // The public setters keep the `Dispatch<SetStateAction<T>>` shape callers
  // already pass — a functional update is resolved by the reducer against the
  // previous value, and each setter stays stable across renders.
  const setHabits = useCallback<Dispatch<SetStateAction<Habit[]>>>((update) => {
    dispatch({ type: 'habitsSet', update });
  }, []);
  const setLogs = useCallback<Dispatch<SetStateAction<HabitLog[]>>>((update) => {
    dispatch({ type: 'logsSet', update });
  }, []);
  const setMode = useCallback<Dispatch<SetStateAction<DashboardMode>>>((update) => {
    dispatch({ type: 'modeSet', update });
  }, []);
  const setUser = useCallback<Dispatch<SetStateAction<unknown>>>((update) => {
    dispatch({ type: 'userSet', update });
  }, []);

  const identity = identityFromUser(state.user);
  const isSignedIn = identity !== GUEST_IDENTITY;
  const loaded = state.loadedFor === identity;

  // The last screen this identity painted (#495), read during render so the
  // first frame after a cold navigation carries it instead of empty markup.
  const snapshot = useSnapshot<DashboardSnapshot>(identity, HABITFLOW_SNAPSHOT_ROUTE);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // An identity change is a different partition: the previous account's rows
    // must not stand in for this one while its store opens (`loadedFor`).
    let cancelled = false;
    let opened: HabitLocalStore | null = null;

    HabitLocalStore.open(identity)
      .then(async (localStore) => {
        opened = localStore;
        if (cancelled) {
          localStore.close();
          return;
        }
        // Signing in claims any work done as a guest before the seed runs, so
        // the claimed rows count as "already there" and are never overwritten.
        if (identity !== GUEST_IDENTITY) {
          await claimGuestData(localStore).catch((error) => {
            logger.error('Failed to claim guest HabitFlow data', { error: String(error) });
          });
        }
        if (cancelled) {
          localStore.close();
          return;
        }
        // The server loader is only a seed: it fills an empty store and never
        // overwrites local writes. After that the store is authoritative.
        await localStore.seedIfEmpty(seed.habits, seed.logs);
        const data = await localStore.getLocalData();
        if (cancelled) {
          localStore.close();
          return;
        }
        dispatch({
          type: 'storeOpened',
          store: localStore,
          habits: visibleHabits(data.habits),
          logs: visibleLogs(data.logs),
          identity,
        });
        // The launch's content mark: owned rows painted from the Local Store (#487).
        markContent();
      })
      .catch((error) => {
        logger.error('Failed to open HabitFlow Local Store', { error: String(error) });
      });

    return () => {
      cancelled = true;
      opened?.close();
    };
    // The SSR seed fills an empty store on open; reopening on every seed change
    // would clobber local writes, so identity change is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  async function refreshData() {
    if (!state.store) return;
    const data = await state.store.getLocalData();
    dispatch({
      type: 'dataRefreshed',
      habits: visibleHabits(data.habits),
      logs: visibleLogs(data.logs),
    });
  }

  const syncUser = useCallback(
    async (sessionUser: unknown) => {
      const sessionId = (sessionUser as { id?: string } | null)?.id;
      const currentId = (state.user as { id?: string } | null)?.id;
      if (sessionId !== currentId) {
        dispatch({ type: 'userSynced', user: sessionUser });
      }
    },
    [state.user]
  );

  /**
   * Records the screen the list just painted (#495). `null` before the store
   * answers: an unresolved read is not "this account has no habits", and must
   * never overwrite the last good snapshot with an empty list.
   */
  const recorded = useMemo(
    () => (loaded ? { habits: screenful(state.habits), logs: screenful(state.logs) } : null),
    [loaded, state.habits, state.logs]
  );
  useSnapshotRecorder(identity, HABITFLOW_SNAPSHOT_ROUTE, recorded, { trim: trimDashboard });

  // Before the store answers, the last screen stands in; a device that has never
  // painted this account has no snapshot and keeps the seed it always had.
  const renderedHabits = loaded ? state.habits : (snapshot?.habits ?? seed.habits);
  const renderedLogs = loaded ? state.logs : (snapshot?.logs ?? seed.logs);

  return {
    habits: renderedHabits,
    logs: renderedLogs,
    mode: state.mode,
    user: state.user,
    isSignedIn,
    store: state.store,
    setHabits,
    setLogs,
    setMode,
    setUser,
    refreshData,
    syncUser,
  };
}
