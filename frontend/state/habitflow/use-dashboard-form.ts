import { useState, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';
import { Habit, HabitRepository, HabitTargetPeriod } from '@/shared/contracts/habitflow';

export interface DashboardForm {
  isAddModalOpen: boolean;
  isEditModalOpen: boolean;
  selectedHabit: Habit | null;
  habitName: string;
  habitFrequency: 'daily' | 'weekly';
  habitTarget: string;
  habitTargetPeriod: HabitTargetPeriod | '';
  habitReminderTime: string;
  isSubmitting: boolean;
  formError: string;
  confirmArchiveHabitId: string | null;
  setHabitName: Dispatch<SetStateAction<string>>;
  setHabitFrequency: Dispatch<SetStateAction<'daily' | 'weekly'>>;
  setHabitTarget: Dispatch<SetStateAction<string>>;
  setHabitTargetPeriod: Dispatch<SetStateAction<HabitTargetPeriod | ''>>;
  setHabitReminderTime: Dispatch<SetStateAction<string>>;
  setIsAddModalOpen: Dispatch<SetStateAction<boolean>>;
  setFormError: Dispatch<SetStateAction<string>>;
  handleAddHabit: (e: React.FormEvent) => Promise<void>;
  handleEditHabit: (e: React.FormEvent) => Promise<void>;
  handleArchiveHabit: (habitId: string) => void;
  confirmArchive: () => Promise<void>;
  cancelArchive: () => void;
  openEditModal: (habit: Habit) => void;
  closeEditModal: () => void;
}

function parseTarget(value: string): number | null {
  if (value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
}

export function useDashboardForm(
  store: HabitRepository | null,
  setHabits: Dispatch<SetStateAction<Habit[]>>,
  habits: Habit[]
): DashboardForm {
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [selectedHabit, setSelectedHabit] = useState<Habit | null>(null);

  const [habitName, setHabitName] = useState<string>('');
  const [habitFrequency, setHabitFrequency] = useState<'daily' | 'weekly'>('daily');
  const [habitTarget, setHabitTarget] = useState<string>('');
  const [habitTargetPeriod, setHabitTargetPeriod] = useState<HabitTargetPeriod | ''>('');
  const [habitReminderTime, setHabitReminderTime] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');
  const [confirmArchiveHabitId, setConfirmArchiveHabitId] = useState<string | null>(null);

  const handleAddHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!habitName.trim()) return;
    if (!store) {
      setFormError('جارٍ تجهيز التخزين المحلِّي. يرجى المحاولة بعد لحظة.');
      return;
    }
    setIsSubmitting(true);
    try {
      const habit = await store.createHabit({
        name: habitName.trim(),
        frequency: habitFrequency,
        target: parseTarget(habitTarget),
        targetPeriod: habitTargetPeriod === '' ? null : habitTargetPeriod,
        reminderTime: habitReminderTime === '' ? null : habitReminderTime,
      });
      setHabits((prev) => [...prev, habit]);
      setIsAddModalOpen(false);
      resetFields();
      toast.success('تم إنشاء العادة بنجاح');
    } catch {
      setFormError('حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.');
      toast.error('فشل إنشاء العادة');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!selectedHabit || !habitName.trim()) return;
    if (!store) {
      setFormError('جارٍ تجهيز التخزين المحلِّي. يرجى المحاولة بعد لحظة.');
      return;
    }
    setIsSubmitting(true);
    try {
      const updated = await store.updateHabit(selectedHabit.id, {
        name: habitName.trim(),
        frequency: habitFrequency,
        target: parseTarget(habitTarget),
        targetPeriod: habitTargetPeriod === '' ? null : habitTargetPeriod,
        reminderTime: habitReminderTime === '' ? null : habitReminderTime,
      });
      setHabits((prev) => prev.map((h) => (h.id === selectedHabit.id ? updated : h)));
      setIsEditModalOpen(false);
      setSelectedHabit(null);
      resetFields();
      toast.success('تم تحديث العادة بنجاح');
    } catch {
      setFormError('حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.');
      toast.error('فشل تحديث العادة');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchiveHabit = (habitId: string) => {
    setIsEditModalOpen(false);
    setConfirmArchiveHabitId(habitId);
  };

  const confirmArchive = async () => {
    if (!confirmArchiveHabitId || !store) return;
    setFormError('');

    const archivedHabit = habits.find((h) => h.id === confirmArchiveHabitId);
    const storeRef = store;

    const showUndoToast = (title: string) => {
      toast(title, {
        action: {
          label: 'تراجع',
          onClick: async () => {
            const id = confirmArchiveHabitId;
            if (!id || !archivedHabit) return;
            try {
              // A delete is a tombstone; undo is a newer write that clears it.
              await storeRef.updateHabit(id, { archived: false, deletedAt: null });
              setHabits((prev) =>
                prev.some((h) => h.id === id)
                  ? prev
                  : [...prev, { ...archivedHabit, archived: false, deletedAt: null }]
              );
            } catch {
              toast.error('فشل استرجاع العادة');
            }
          },
        },
      });
    };

    try {
      const success = await store.deleteHabit(confirmArchiveHabitId);
      if (!success) {
        setFormError('فشل في أرشفة العادة. يرجى المحاولة مرة أخرى.');
        setConfirmArchiveHabitId(null);
        return;
      }
      setHabits((prev) => prev.filter((h) => h.id !== confirmArchiveHabitId));
      setIsEditModalOpen(false);
      setSelectedHabit(null);
      setFormError('');
      setConfirmArchiveHabitId(null);
      showUndoToast('تم أرشفة العادة');
    } catch {
      setFormError('حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.');
      setConfirmArchiveHabitId(null);
      toast.error('فشل أرشفة العادة');
    }
  };

  const cancelArchive = () => {
    setIsEditModalOpen(true);
    setConfirmArchiveHabitId(null);
  };

  const resetFields = () => {
    setHabitName('');
    setHabitFrequency('daily');
    setHabitTarget('');
    setHabitTargetPeriod('');
    setHabitReminderTime('');
    setFormError('');
  };

  const openEditModal = (habit: Habit) => {
    setSelectedHabit(habit);
    setHabitName(habit.name);
    setHabitFrequency(habit.frequency);
    setHabitTarget(habit.target != null ? String(habit.target) : '');
    setHabitTargetPeriod(habit.targetPeriod ?? '');
    setHabitReminderTime(habit.reminderTime ?? '');
    setIsEditModalOpen(true);
    setFormError('');
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setSelectedHabit(null);
    resetFields();
  };

  return {
    isAddModalOpen,
    isEditModalOpen,
    selectedHabit,
    habitName,
    habitFrequency,
    habitTarget,
    habitTargetPeriod,
    habitReminderTime,
    isSubmitting,
    formError,
    confirmArchiveHabitId,
    setHabitName,
    setHabitFrequency,
    setHabitTarget,
    setHabitTargetPeriod,
    setHabitReminderTime,
    setIsAddModalOpen,
    setFormError,
    handleAddHabit,
    handleEditHabit,
    handleArchiveHabit,
    confirmArchive,
    cancelArchive,
    openEditModal,
    closeEditModal,
  };
}
