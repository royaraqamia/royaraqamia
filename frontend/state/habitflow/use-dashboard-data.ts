import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import { Habit, HabitLog } from '@/shared/contracts/habitflow';
import { HabitLocalStore } from '@/frontend/api/habitflow/local-store';
import { identityFromUser } from '@/frontend/shared/local-store/identity';
import { logger } from '@/frontend/shared/logger';

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

  const identity = identityFromUser(user);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;
    let opened: HabitLocalStore | null = null;

    HabitLocalStore.open(identity)
      .then(async (localStore) => {
        opened = localStore;
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

  return {
    habits,
    logs,
    mode,
    user,
    store,
    setHabits,
    setLogs,
    setMode,
    setUser,
    refreshData,
    syncUser,
  };
}
