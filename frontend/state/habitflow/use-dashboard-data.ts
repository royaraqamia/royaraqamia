import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import { Habit, HabitLog } from '@/shared/contracts/habitflow';
import { LocalStorageHabitRepository } from '@/frontend/api/habitflow/local-storage-repository';

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
  setHabits: Dispatch<SetStateAction<Habit[]>>;
  setLogs: Dispatch<SetStateAction<HabitLog[]>>;
  setMode: Dispatch<SetStateAction<'supabase' | 'local'>>;
  setUser: Dispatch<SetStateAction<unknown>>;
  refreshData: () => Promise<void>;
  syncUser: (sessionUser: unknown) => Promise<void>;
}

export function useDashboardData(seed: DashboardSeed): DashboardData {
  const [habits, setHabits] = useState<Habit[]>(seed.habits);
  const [logs, setLogs] = useState<HabitLog[]>(seed.logs);
  const [mode, setMode] = useState<'supabase' | 'local'>(seed.mode);
  const [user, setUser] = useState(seed.user);

  useEffect(() => {
    if (seed.user) return;
    LocalStorageHabitRepository.seedFromSSR(seed.habits, seed.logs);
    const habitsRaw = localStorage.getItem('habitflow_habits');
    if (habitsRaw) {
      try {
        const parsed: Habit[] = JSON.parse(habitsRaw);
        const filtered = parsed.filter((h) => !h.archived);
        if (filtered.length > 0) {
          setHabits(filtered);
        }
      } catch {
        /* ignore parse error */
      }
    }
    const logsRaw = localStorage.getItem('habitflow_logs');
    if (logsRaw) {
      try {
        setLogs(JSON.parse(logsRaw));
      } catch {
        /* ignore parse error */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshData() {
    const { ApiClient } = await import('@/frontend/api/habitflow/habit-api');
    const [data, freshUser] = await Promise.all([
      ApiClient.fetchInitialData(),
      ApiClient.fetchUser(),
    ]);
    setHabits(data.habits);
    setLogs(data.logs);
    setMode(data.mode);
    setUser(freshUser);
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
    setHabits,
    setLogs,
    setMode,
    setUser,
    refreshData,
    syncUser,
  };
}
