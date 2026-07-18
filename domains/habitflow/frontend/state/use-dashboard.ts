import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { Habit, HabitLog } from '@/domains/habitflow/models';
import { HabitService, AggregateStats } from '@/domains/habitflow/services/habit-service';
import { createHabit, updateHabit, archiveHabit, toggleLog } from '@/app/habitflow/actions/habits';
import { LocalStorageHabitRepository } from '@/domains/habitflow/frontend/repositories/local-storage-repository';

function getTodayString(): string {
  const tzOffset = new Date().getTimezoneOffset() * 60000;
  return new Date(Date.now() - tzOffset).toISOString().slice(0, 10);
}

interface SeedData {
  habits: Habit[];
  logs: HabitLog[];
  mode: 'supabase' | 'local';
  user: unknown;
}

const localRepo = new LocalStorageHabitRepository();

export function useDashboard(seed: SeedData) {
  const [habits, setHabits] = useState<Habit[]>(seed.habits);
  const [logs, setLogs] = useState<HabitLog[]>(seed.logs);
  const [mode, setMode] = useState<'supabase' | 'local'>(seed.mode);
  const [user, setUser] = useState(seed.user);
  const [activeDate, setActiveDate] = useState<string>(getTodayString);

  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [selectedHabit, setSelectedHabit] = useState<Habit | null>(null);

  const [habitName, setHabitName] = useState<string>('');
  const [habitIcon, setHabitIcon] = useState<string>('Activity');
  const [habitFrequency, setHabitFrequency] = useState<'daily' | 'weekly'>('daily');

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
      const { ApiClient } = await import('@/domains/habitflow/frontend/api/habit-api');
      await ApiClient.syncToCloud({ habits: localHabits, logs: localLogs });
      localStorage.removeItem('habitflow_habits');
      localStorage.removeItem('habitflow_logs');
      const freshData = await import('@/app/habitflow/actions/habits').then((m) =>
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
          setTimeout(() => syncLocalToCloud(), 0);
        }
      } catch {
        /* ignore parse error */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');
  const [confirmArchiveHabitId, setConfirmArchiveHabitId] = useState<string | null>(null);
  const [togglingHabitId, setTogglingHabitId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!habitName.trim()) return;
    setIsSubmitting(true);

    if (user) {
      const formData = new FormData();
      formData.append('name', habitName);
      formData.append('icon', habitIcon);
      formData.append('frequency', habitFrequency);
      try {
        const result = await createHabit(formData);
        if ('error' in result) {
          setFormError(result.error as string);
          return;
        }
        if ('habit' in result && result.habit) {
          setHabits((prev) => [...prev, result.habit]);
          setIsAddModalOpen(false);
          setHabitName('');
          setHabitIcon('Activity');
          setHabitFrequency('daily');
          setFormError('');
          toast.success('تم إنشاء العادة بنجاح');
        }
      } catch (e) {
        setFormError('حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.');
        toast.error('فشل إنشاء العادة');
      }
    } else {
      try {
        const habit = await localRepo.createHabit({
          name: habitName.trim(),
          icon: habitIcon,
          frequency: habitFrequency,
        });
        setHabits((prev) => [...prev, habit]);
        setIsAddModalOpen(false);
        setHabitName('');
        setHabitIcon('Activity');
        setHabitFrequency('daily');
        setFormError('');
        toast.success('تم إنشاء العادة محلياً');
      } catch (e) {
        setFormError('حدث خطأ أثناء حفظ العادة محلياً.');
        toast.error('فشل حفظ العادة محلياً');
      }
    }
    setIsSubmitting(false);
  };

  const handleEditHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!selectedHabit || !habitName.trim()) return;
    setIsSubmitting(true);

    if (user) {
      const formData = new FormData();
      formData.append('id', selectedHabit.id);
      formData.append('name', habitName);
      formData.append('icon', habitIcon);
      formData.append('frequency', habitFrequency);
      try {
        const result = await updateHabit(formData);
        if ('error' in result) {
          setFormError(result.error as string);
          return;
        }
        if ('habit' in result && result.habit) {
          setHabits((prev) => prev.map((h) => (h.id === selectedHabit.id ? result.habit : h)));
          setIsEditModalOpen(false);
          setSelectedHabit(null);
          setHabitName('');
          setFormError('');
          toast.success('تم تحديث العادة بنجاح');
        }
      } catch (e) {
        setFormError('حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.');
        toast.error('فشل تحديث العادة');
      }
    } else {
      try {
        const updated = await localRepo.updateHabit(selectedHabit.id, {
          name: habitName.trim(),
          icon: habitIcon,
          frequency: habitFrequency,
        });
        setHabits((prev) => prev.map((h) => (h.id === selectedHabit.id ? updated : h)));
        setIsEditModalOpen(false);
        setSelectedHabit(null);
        setHabitName('');
        setFormError('');
        toast.success('تم تحديث العادة محلياً');
      } catch (e) {
        setFormError('حدث خطأ أثناء تحديث العادة محلياً.');
        toast.error('فشل تحديث العادة محلياً');
      }
    }
    setIsSubmitting(false);
  };

  const handleArchiveHabit = async (habitId: string) => {
    setConfirmArchiveHabitId(habitId);
  };

  const confirmArchive = async () => {
    if (!confirmArchiveHabitId) return;
    setFormError('');

    if (user) {
      try {
        const result = await archiveHabit(confirmArchiveHabitId);
        if ('error' in result) {
          setFormError(result.error as string);
          setConfirmArchiveHabitId(null);
          return;
        }
        if ('success' in result && result.success) {
          setHabits((prev) => prev.filter((h) => h.id !== confirmArchiveHabitId));
          setIsEditModalOpen(false);
          setSelectedHabit(null);
          setFormError('');
          setConfirmArchiveHabitId(null);
          toast.success('تم أرشفة العادة بنجاح');
        }
      } catch (e) {
        setFormError('حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.');
        setConfirmArchiveHabitId(null);
        toast.error('فشل أرشفة العادة');
      }
    } else {
      try {
        await localRepo.deleteHabit(confirmArchiveHabitId);
        setHabits((prev) => prev.filter((h) => h.id !== confirmArchiveHabitId));
        setIsEditModalOpen(false);
        setSelectedHabit(null);
        setFormError('');
        setConfirmArchiveHabitId(null);
        toast.success('تم أرشفة العادة محلياً');
      } catch (e) {
        setFormError('حدث خطأ أثناء أرشفة العادة محلياً.');
        setConfirmArchiveHabitId(null);
        toast.error('فشل أرشفة العادة محلياً');
      }
    }
  };

  const cancelArchive = () => {
    setConfirmArchiveHabitId(null);
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

  const handleDownloadBackup = async () => {
    try {
      const { ApiClient } = await import('@/domains/habitflow/frontend/api/habit-api');
      const data = await ApiClient.exportBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `habitflow_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to download backup', e);
      toast.error('فشل تحميل النسخة الاحتياطية');
    }
  };

  const handleImportBackupFile = async (file: File) => {
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed.habits || !parsed.logs) {
        toast.error('صيغة النسخة الاحتياطية غير صالحة');
        return;
      }

      const { ApiClient } = await import('@/domains/habitflow/frontend/api/habit-api');
      await ApiClient.importBackup(parsed);
      toast.success('تم استعادة النسخة الاحتياطية بنجاح');
      setTimeout(async () => {
        await refreshData();
      }, 1500);
    } catch (e: any) {
      toast.error(e.message || 'فشل في قراءة ملف النسخة الاحتياطية');
    }
  };

  async function refreshData() {
    const { fetchInitialData } = await import('@/app/habitflow/actions/habits');
    const data = await fetchInitialData();
    setHabits(data.habits);
    setLogs(data.logs);
    setMode(data.mode);
    setUser(data.user);
  }

  const activeStats: AggregateStats = HabitService.calculateAggregateStats(
    habits,
    logs,
    activeDate
  );
  const calendarGrid = HabitService.get30DayCalendarGrid(activeDate);

  const handleDateShift = (days: number) => {
    const current = new Date(activeDate);
    current.setDate(current.getDate() + days);
    setActiveDate(current.toISOString().split('T')[0]!);
  };

  const getReadableActiveDate = () => {
    const d = new Date(activeDate);
    return d.toLocaleDateString('ar-SA', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const openEditModal = (habit: Habit) => {
    setSelectedHabit(habit);
    setHabitName(habit.name);
    setHabitIcon(habit.icon);
    setHabitFrequency(habit.frequency);
    setIsEditModalOpen(true);
    setFormError('');
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setSelectedHabit(null);
    setHabitName('');
    setHabitIcon('Activity');
    setHabitFrequency('daily');
    setFormError('');
  };

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
                await syncLocalToCloud();
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
    activeDate,
    formError,
    isSubmitting,
    isAddModalOpen,
    isEditModalOpen,
    selectedHabit,
    habitName,
    habitIcon,
    habitFrequency,
    fileInputRef,
    activeStats,
    calendarGrid,
    setHabitName,
    setHabitIcon,
    setHabitFrequency,
    setIsAddModalOpen,
    setFormError,
    setActiveDate,
    handleAddHabit,
    handleEditHabit,
    handleArchiveHabit,
    confirmArchive,
    cancelArchive,
    confirmArchiveHabitId,
    handleToggleLog,
    handleDownloadBackup,
    handleImportBackupFile,
    togglingHabitId,
    handleDateShift,
    getReadableActiveDate,
    openEditModal,
    closeEditModal,
    syncUser,
    todayDate: getTodayString(),
  };
}
