import { useState, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';
import { HabitLog } from '@/shared/contracts/habitflow';
import { ApiClient } from '@/frontend/api/habitflow/habit-api';
import { LocalStorageHabitRepository } from '@/frontend/api/habitflow/local-storage-repository';

const localRepo = new LocalStorageHabitRepository();

export interface DashboardToggle {
  togglingHabitId: string | null;
  skippingHabitId: string | null;
  handleToggleLog: (habitId: string) => Promise<void>;
  handleSkipHabit: (habitId: string) => Promise<void>;
  handleSaveNote: (habitId: string, note: string) => Promise<void>;
}

export function useDashboardToggle(
  user: unknown,
  logs: HabitLog[],
  setLogs: Dispatch<SetStateAction<HabitLog[]>>,
  activeDate: string
): DashboardToggle {
  const [togglingHabitId, setTogglingHabitId] = useState<string | null>(null);
  const [skippingHabitId, setSkippingHabitId] = useState<string | null>(null);

  const applyLogLocally = (updatedLogs: HabitLog[], habitId: string, patch: Partial<HabitLog>) => {
    const existingIndex = updatedLogs.findIndex(
      (l) => l.habitId === habitId && l.date === activeDate
    );
    if (existingIndex !== -1) {
      updatedLogs[existingIndex] = { ...updatedLogs[existingIndex]!, ...patch };
    } else {
      updatedLogs.push({
        id: `temp-${Math.random().toString(36).substring(2, 9)}`,
        habitId,
        date: activeDate,
        completed: false,
        completedAt: null,
        ...patch,
      });
    }
  };

  const handleToggleLog = async (habitId: string) => {
    if (togglingHabitId === habitId) return;
    setTogglingHabitId(habitId);
    try {
      const isCompleted = logs.some(
        (l) => l.habitId === habitId && l.date === activeDate && l.completed
      );
      const nextCompleted = !isCompleted;

      const updatedLogs = [...logs];
      applyLogLocally(updatedLogs, habitId, {
        completed: nextCompleted,
        completedAt: nextCompleted ? new Date().toISOString() : null,
        ...(nextCompleted ? { kind: 'complete' } : { kind: undefined }),
      });
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

  const handleSkipHabit = async (habitId: string) => {
    if (skippingHabitId === habitId) return;
    setSkippingHabitId(habitId);
    try {
      const currentLog = logs.find((l) => l.habitId === habitId && l.date === activeDate);
      const isSkipped = currentLog?.kind === 'skip';
      const nextKind = isSkipped ? 'none' : 'skip';

      const updatedLogs = [...logs];
      applyLogLocally(updatedLogs, habitId, {
        completed: false,
        completedAt: null,
        kind: nextKind === 'none' ? undefined : 'skip',
      });
      setLogs(updatedLogs);

      if (user) {
        try {
          const result = await ApiClient.setLogKind(
            habitId,
            activeDate,
            nextKind as 'skip' | 'none'
          );
          setLogs((prev) =>
            prev.map((l) => (l.habitId === habitId && l.date === activeDate ? result.log : l))
          );
          if (nextKind === 'skip') toast.success('تم تخطي اليوم — سلسلتك محفوظة');
        } catch {
          setLogs((prev) =>
            prev.map((l) =>
              l.habitId === habitId && l.date === activeDate
                ? {
                    ...l,
                    kind: isSkipped ? 'skip' : undefined,
                    completed: false,
                    completedAt: null,
                  }
                : l
            )
          );
          toast.error('حدث خطأ أثناء تخطي اليوم. يرجى المحاولة مرة أخرى.');
        }
      } else {
        const log = await localRepo.setLogKind(habitId, activeDate, nextKind as 'skip' | 'none');
        setLogs((prev) =>
          prev.map((l) => (l.habitId === habitId && l.date === activeDate ? log : l))
        );
        if (nextKind === 'skip') toast.success('تم تخطي اليوم — سلسلتك محفوظة');
      }
    } finally {
      setSkippingHabitId(null);
    }
  };

  const handleSaveNote = async (habitId: string, note: string) => {
    try {
      const trimmed = note.trim();
      const nextNote = trimmed === '' ? null : trimmed;

      setLogs((prev) =>
        prev.map((l) =>
          l.habitId === habitId && l.date === activeDate ? { ...l, note: nextNote } : l
        )
      );

      if (user) {
        await ApiClient.setLogNote(habitId, activeDate, nextNote);
      } else {
        await localRepo.setLogNote(habitId, activeDate, nextNote);
      }
      toast.success(nextNote ? 'تم حفظ الملاحظة' : 'تم مسح الملاحظة');
    } catch {
      toast.error('حدث خطأ أثناء حفظ الملاحظة. يرجى المحاولة مرة أخرى.');
    }
  };

  return {
    togglingHabitId,
    skippingHabitId,
    handleToggleLog,
    handleSkipHabit,
    handleSaveNote,
  };
}
