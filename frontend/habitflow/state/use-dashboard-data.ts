import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { Habit, HabitLog } from '@/shared/contracts/habitflow';
import { LocalStorageHabitRepository } from '@/frontend/habitflow/api/local-storage-repository';

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

const localRepo = new LocalStorageHabitRepository();

export interface DashboardData {
  habits: Habit[];
  logs: HabitLog[];
  mode: 'supabase' | 'local';
  user: unknown;
  setHabits: Dispatch<SetStateAction<Habit[]>>;
  setLogs: Dispatch<SetStateAction<HabitLog[]>>;
  setMode: Dispatch<SetStateAction<'supabase' | 'local'>>;
  setUser: Dispatch<SetStateAction<unknown>>;
  showSyncConfirm: boolean;
  confirmSyncToCloud: () => Promise<void>;
  cancelSyncToCloud: () => void;
  refreshData: () => Promise<void>;
  syncUser: (sessionUser: unknown) => Promise<void>;
}

export function useDashboardData(seed: DashboardSeed): DashboardData {
  const [habits, setHabits] = useState<Habit[]>(seed.habits);
  const [logs, setLogs] = useState<HabitLog[]>(seed.logs);
  const [mode, setMode] = useState<'supabase' | 'local'>(seed.mode);
  const [user, setUser] = useState(seed.user);
  const [showSyncConfirm, setShowSyncConfirm] = useState(false);

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

  const syncLocalToCloud = async () => {
    try {
      const localHabits = await localRepo.getHabits();
      const localLogs = await localRepo.getLogs('2000-01-01', '2099-12-31');
      if (localHabits.length === 0) return;
      const { ApiClient } = await import('@/frontend/habitflow/api/habit-api');
      await ApiClient.syncToCloud({ habits: localHabits, logs: localLogs });
      localStorage.removeItem('habitflow_habits');
      localStorage.removeItem('habitflow_logs');
      const freshData = await import('@/frontend/habitflow/api/habit-actions').then((m) =>
        m.fetchInitialData()
      );
      setHabits(freshData.habits);
      setLogs(freshData.logs);
      setMode(freshData.mode);
      setUser(freshData.user);
    } catch (e) {
      console.error('Failed to sync local data to cloud', e);
    }
  };

  const hasAutoSynced = useRef(false);

  useEffect(() => {
    if (!seed.user || hasAutoSynced.current) return;
    const raw = localStorage.getItem('habitflow_habits');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          hasAutoSynced.current = true;
          setShowSyncConfirm(true);
        }
      } catch {
        /* ignore parse error */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmSyncToCloud = async () => {
    setShowSyncConfirm(false);
    try {
      await syncLocalToCloud();
    } catch (e) {
      console.error('Failed to sync local data to cloud', e);
    }
  };

  const cancelSyncToCloud = () => {
    setShowSyncConfirm(false);
    localStorage.removeItem('habitflow_habits');
    localStorage.removeItem('habitflow_logs');
  };

  async function refreshData() {
    const { fetchInitialData } = await import('@/frontend/habitflow/api/habit-actions');
    const data = await fetchInitialData();
    setHabits(data.habits);
    setLogs(data.logs);
    setMode(data.mode);
    setUser(data.user);
  }

  const syncUser = useCallback(
    async (sessionUser: unknown) => {
      const sessionId = (sessionUser as { id?: string } | null)?.id;
      const currentId = (user as { id?: string } | null)?.id;
      if (sessionId !== currentId) {
        setUser(sessionUser);
        if (sessionUser) {
          setMode('supabase');
          try {
            const raw = localStorage.getItem('habitflow_habits');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setShowSyncConfirm(true);
              }
            }
          } catch (e) {
            console.error('Auto-sync failed:', e);
          }
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
    showSyncConfirm,
    confirmSyncToCloud,
    cancelSyncToCloud,
    refreshData,
    syncUser,
  };
}
