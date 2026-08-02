import { useState, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';
import { HabitLog } from '@/shared/contracts/habitflow';
import { toggleLog } from '@/app/habitflow/actions/habits';
import { LocalStorageHabitRepository } from '@/frontend/habitflow/repositories/local-storage-repository';

const localRepo = new LocalStorageHabitRepository();

export interface DashboardToggle {
  togglingHabitId: string | null;
  handleToggleLog: (habitId: string) => Promise<void>;
}

export function useDashboardToggle(
  user: unknown,
  logs: HabitLog[],
  setLogs: Dispatch<SetStateAction<HabitLog[]>>,
  activeDate: string
): DashboardToggle {
  const [togglingHabitId, setTogglingHabitId] = useState<string | null>(null);

  const handleToggleLog = async (habitId: string) => {
    if (togglingHabitId === habitId) return;
    setTogglingHabitId(habitId);
    try {
      const isCompleted = logs.some(
        (l) => l.habitId === habitId && l.date === activeDate && l.completed
      );
      const nextCompleted = !isCompleted;

      const updatedLogs = [...logs];
      const existingIndex = updatedLogs.findIndex(
        (l) => l.habitId === habitId && l.date === activeDate
      );
      if (existingIndex !== -1) {
        updatedLogs[existingIndex] = {
          ...updatedLogs[existingIndex]!,
          completed: nextCompleted,
          completedAt: nextCompleted ? new Date().toISOString() : null,
        };
      } else {
        updatedLogs.push({
          id: `temp-${Math.random().toString(36).substring(2, 9)}`,
          habitId,
          date: activeDate,
          completed: nextCompleted,
          completedAt: nextCompleted ? new Date().toISOString() : null,
        });
      }
      setLogs(updatedLogs);

      if (user) {
        const result = await toggleLog(habitId, activeDate, nextCompleted);
        if ('error' in result) {
          setLogs((prev) =>
            prev.map((l) =>
              l.habitId === habitId && l.date === activeDate
                ? { ...l, completed: !nextCompleted }
                : l
            )
          );
          toast.error(result.error);
          return;
        }
        if ('log' in result && result.log) {
          setLogs((prev) =>
            prev.map((l) => (l.habitId === habitId && l.date === activeDate ? result.log : l))
          );
          if (nextCompleted) toast.success('تم تسجيل العادة');
        }
      } else {
        const log = await localRepo.toggleLog(habitId, activeDate, nextCompleted);
        setLogs((prev) =>
          prev.map((l) => (l.habitId === habitId && l.date === activeDate ? log : l))
        );
        if (nextCompleted) toast.success('تم تسجيل العادة');
      }
    } finally {
      setTogglingHabitId(null);
    }
  };

  return { togglingHabitId, handleToggleLog };
}
