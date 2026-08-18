import { useState, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';
import { Habit, HabitTargetPeriod } from '@/shared/contracts/habitflow';
import { ApiClient, ApiError } from '@/frontend/api/habitflow/habit-api';
import { LocalStorageHabitRepository } from '@/frontend/api/habitflow/local-storage-repository';

const localRepo = new LocalStorageHabitRepository();

export interface DashboardForm {
  isAddModalOpen: boolean;
  isEditModalOpen: boolean;
  selectedHabit: Habit | null;
  habitName: string;
  habitIcon: string;
  habitFrequency: 'daily' | 'weekly';
  habitTarget: string;
  habitTargetPeriod: HabitTargetPeriod | '';
  habitReminderTime: string;
  isSubmitting: boolean;
  formError: string;
  confirmArchiveHabitId: string | null;
  setHabitName: Dispatch<SetStateAction<string>>;
  setHabitIcon: Dispatch<SetStateAction<string>>;
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
  user: unknown,
  setHabits: Dispatch<SetStateAction<Habit[]>>,
  habits: Habit[]
): DashboardForm {
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [selectedHabit, setSelectedHabit] = useState<Habit | null>(null);

  const [habitName, setHabitName] = useState<string>('');
  const [habitIcon, setHabitIcon] = useState<string>('Activity');
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
    setIsSubmitting(true);

    if (user) {
      try {
        const result = await ApiClient.createHabit(
          habitName,
          habitIcon,
          habitFrequency,
          parseTarget(habitTarget),
          habitTargetPeriod === '' ? null : habitTargetPeriod,
          habitReminderTime === '' ? null : habitReminderTime
        );
        setHabits((prev) => [...prev, result.habit]);
        setIsAddModalOpen(false);
        resetFields();
        toast.success('تم إنشاء العادة بنجاح');
      } catch (e) {
        if (e instanceof ApiError && e.status === 400) {
          setFormError(e.message);
        } else {
          setFormError('حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.');
          toast.error('فشل إنشاء العادة');
        }
      }
    } else {
      try {
        const habit = await localRepo.createHabit({
          name: habitName.trim(),
          icon: habitIcon,
          frequency: habitFrequency,
          target: parseTarget(habitTarget),
          targetPeriod: habitTargetPeriod === '' ? null : habitTargetPeriod,
          reminderTime: habitReminderTime === '' ? null : habitReminderTime,
        });
        setHabits((prev) => [...prev, habit]);
        setIsAddModalOpen(false);
        resetFields();
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
      try {
        const result = await ApiClient.updateHabit(
          selectedHabit.id,
          habitName,
          habitIcon,
          habitFrequency,
          parseTarget(habitTarget),
          habitTargetPeriod === '' ? null : habitTargetPeriod,
          habitReminderTime === '' ? null : habitReminderTime
        );
        setHabits((prev) => prev.map((h) => (h.id === selectedHabit.id ? result.habit : h)));
        setIsEditModalOpen(false);
        setSelectedHabit(null);
        resetFields();
        toast.success('تم تحديث العادة بنجاح');
      } catch (e) {
        if (e instanceof ApiError && e.status === 400) {
          setFormError(e.message);
        } else {
          setFormError('حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.');
          toast.error('فشل تحديث العادة');
        }
      }
    } else {
      try {
        const updated = await localRepo.updateHabit(selectedHabit.id, {
          name: habitName.trim(),
          icon: habitIcon,
          frequency: habitFrequency,
          target: parseTarget(habitTarget),
          targetPeriod: habitTargetPeriod === '' ? null : habitTargetPeriod,
          reminderTime: habitReminderTime === '' ? null : habitReminderTime,
        });
        setHabits((prev) => prev.map((h) => (h.id === selectedHabit.id ? updated : h)));
        setIsEditModalOpen(false);
        setSelectedHabit(null);
        resetFields();
        toast.success('تم تحديث العادة محلياً');
      } catch (e) {
        setFormError('حدث خطأ أثناء تحديث العادة محلياً.');
        toast.error('فشل تحديث العادة محلياً');
      }
    }
    setIsSubmitting(false);
  };

  const handleArchiveHabit = (habitId: string) => {
    setIsEditModalOpen(false);
    setConfirmArchiveHabitId(habitId);
  };

  const confirmArchive = async () => {
    if (!confirmArchiveHabitId) return;
    setFormError('');

    const archivedHabit = habits.find((h) => h.id === confirmArchiveHabitId);

    const showUndoToast = (title: string) => {
      toast(title, {
        action: {
          label: 'تراجع',
          onClick: async () => {
            const id = confirmArchiveHabitId;
            if (!id || !archivedHabit) return;
            try {
              if (user) {
                await ApiClient.unarchiveHabit(id);
              } else {
                await localRepo.updateHabit(id, { archived: false });
              }
              setHabits((prev) =>
                prev.some((h) => h.id === id)
                  ? prev
                  : [...prev, { ...archivedHabit, archived: false }]
              );
            } catch {
              toast.error('فشل استرجاع العادة');
            }
          },
        },
      });
    };

    if (user) {
      try {
        const success = await ApiClient.archiveHabit(confirmArchiveHabitId);
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
        showUndoToast('تم أرشفة العادة محلياً');
      } catch (e) {
        setFormError('حدث خطأ أثناء أرشفة العادة محلياً.');
        setConfirmArchiveHabitId(null);
        toast.error('فشل أرشفة العادة محلياً');
      }
    }
  };

  const cancelArchive = () => {
    setIsEditModalOpen(true);
    setConfirmArchiveHabitId(null);
  };

  const resetFields = () => {
    setHabitName('');
    setHabitIcon('Activity');
    setHabitFrequency('daily');
    setHabitTarget('');
    setHabitTargetPeriod('');
    setHabitReminderTime('');
    setFormError('');
  };

  const openEditModal = (habit: Habit) => {
    setSelectedHabit(habit);
    setHabitName(habit.name);
    setHabitIcon(habit.icon);
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
    habitIcon,
    habitFrequency,
    habitTarget,
    habitTargetPeriod,
    habitReminderTime,
    isSubmitting,
    formError,
    confirmArchiveHabitId,
    setHabitName,
    setHabitIcon,
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
