import { useState, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';
import { HabitLog } from '@/shared/contracts/habitflow';
import { ApiClient } from '@/frontend/api/habitflow/habit-api';
import { LocalStorageHabitRepository } from '@/frontend/api/habitflow/local-storage-repository';

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
        try {
          const result = await ApiClient.toggleLog(habitId, activeDate, nextCompleted);
          setLogs((prev) =>
            prev.map((l) => (l.habitId === habitId && l.date === activeDate ? result.log : l))
          );
          if (nextCompleted) toast.success('تم تسجيل العادة');
        } catch {
          setLogs((prev) =>
            prev.map((l) =>
              l.habitId === habitId && l.date === activeDate
                ? { ...l, completed: !nextCompleted }
                : l
            )
          );
          toast.error('حدث خطأ أثناء تسجيل العادة. يرجى المحاولة مرة أخرى.');
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
