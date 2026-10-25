import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { Habit, HabitLog } from '@/shared/contracts/habitflow';
import { HabitLocalStore } from '@/frontend/api/habitflow/local-store';
import {
  GUEST_IDENTITY,
  identityFromUser,
  type LocalIdentity,
} from '@/frontend/shared/local-store/identity';
import {
  halveList,
  screenful,
  useSnapshot,
  useSnapshotRecorder,
} from '@/frontend/shared/local-store/snapshot';
import { logger } from '@/frontend/shared/logger';
import { markContent } from '@/frontend/shared/perf-marks';

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

export function getTodayString(): string {
  const tzOffset = new Date().getTimezoneOffset() * 60000;
  return new Date(Date.now() - tzOffset).toISOString().slice(0, 10);
}

export interface DashboardSeed {
  habits: Habit[];
  logs: HabitLog[];
  mode: 'supabase' | 'local';
  user: unknown;
}

export interface DashboardData {
  habits: Habit[];
  logs: HabitLog[];
  mode: 'supabase' | 'local';
  user: unknown;
  /** True once a real session exists; the Outbox only flushes for an account. */
  isSignedIn: boolean;
  /** The identity-scoped Local Store once it is open; the source of truth for rendering. */
  store: HabitLocalStore | null;
  setHabits: Dispatch<SetStateAction<Habit[]>>;
  setLogs: Dispatch<SetStateAction<HabitLog[]>>;
  setMode: Dispatch<SetStateAction<'supabase' | 'local'>>;
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
  const [habits, setHabits] = useState<Habit[]>(seed.habits);
  const [logs, setLogs] = useState<HabitLog[]>(seed.logs);
  const [mode, setMode] = useState<'supabase' | 'local'>(seed.mode);
  const [user, setUser] = useState(seed.user);
  const [store, setStore] = useState<HabitLocalStore | null>(null);
  /**
   * The identity whose rows the store read answered, or `null` before the first
   * read. Tagged with the identity rather than a boolean so an identity change
   * cannot paint the previous account's rows while the new store opens.
   */
  const [loadedFor, setLoadedFor] = useState<LocalIdentity | null>(null);

  const identity = identityFromUser(user);
  const isSignedIn = identity !== GUEST_IDENTITY;
  const loaded = loadedFor === identity;

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
        setStore(localStore);
        setHabits(visibleHabits(data.habits));
        setLogs(visibleLogs(data.logs));
        setLoadedFor(identity);
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
    if (!store) return;
    const data = await store.getLocalData();
    setHabits(visibleHabits(data.habits));
    setLogs(visibleLogs(data.logs));
  }

  const syncUser = useCallback(
    async (sessionUser: unknown) => {
      const sessionId = (sessionUser as { id?: string } | null)?.id;
      const currentId = (user as { id?: string } | null)?.id;
      if (sessionId !== currentId) {
        setUser(sessionUser);
        if (sessionUser) {
          setMode('supabase');
        }
      }
    },
    [user]
  );

  /**
   * Records the screen the list just painted (#495). `null` before the store
   * answers: an unresolved read is not "this account has no habits", and must
   * never overwrite the last good snapshot with an empty list.
   */
  const recorded = useMemo(
    () => (loaded ? { habits: screenful(habits), logs: screenful(logs) } : null),
    [loaded, habits, logs]
  );
  useSnapshotRecorder(identity, HABITFLOW_SNAPSHOT_ROUTE, recorded, { trim: trimDashboard });

  // Before the store answers, the last screen stands in; a device that has never
  // painted this account has no snapshot and keeps the seed it always had.
  const renderedHabits = loaded ? habits : (snapshot?.habits ?? seed.habits);
  const renderedLogs = loaded ? logs : (snapshot?.logs ?? seed.logs);

  return {
    habits: renderedHabits,
    logs: renderedLogs,
    mode,
    user,
    isSignedIn,
    store,
    setHabits,
    setLogs,
    setMode,
    setUser,
    refreshData,
    syncUser,
  };
}
