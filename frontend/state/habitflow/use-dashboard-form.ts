import { useState, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';
import { Habit } from '@/shared/contracts/habitflow';
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
  isSubmitting: boolean;
  formError: string;
  confirmArchiveHabitId: string | null;
  setHabitName: Dispatch<SetStateAction<string>>;
  setHabitIcon: Dispatch<SetStateAction<string>>;
  setHabitFrequency: Dispatch<SetStateAction<'daily' | 'weekly'>>;
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

export function useDashboardForm(
  user: unknown,
  setHabits: Dispatch<SetStateAction<Habit[]>>
): DashboardForm {
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [selectedHabit, setSelectedHabit] = useState<Habit | null>(null);

  const [habitName, setHabitName] = useState<string>('');
  const [habitIcon, setHabitIcon] = useState<string>('Activity');
  const [habitFrequency, setHabitFrequency] = useState<'daily' | 'weekly'>('daily');

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
        const result = await ApiClient.createHabit(habitName, habitIcon, habitFrequency);
        setHabits((prev) => [...prev, result.habit]);
        setIsAddModalOpen(false);
        setHabitName('');
        setHabitIcon('Activity');
        setHabitFrequency('daily');
        setFormError('');
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
      try {
        const result = await ApiClient.updateHabit(
          selectedHabit.id,
          habitName,
          habitIcon,
          habitFrequency
        );
        setHabits((prev) => prev.map((h) => (h.id === selectedHabit.id ? result.habit : h)));
        setIsEditModalOpen(false);
        setSelectedHabit(null);
        setHabitName('');
        setFormError('');
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

  const handleArchiveHabit = (habitId: string) => {
    setIsEditModalOpen(false);
    setConfirmArchiveHabitId(habitId);
  };

  const confirmArchive = async () => {
    if (!confirmArchiveHabitId) return;
    setFormError('');

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
        toast.success('تم أرشفة العادة بنجاح');
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
    setIsEditModalOpen(true);
    setConfirmArchiveHabitId(null);
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

  return {
    isAddModalOpen,
    isEditModalOpen,
    selectedHabit,
    habitName,
    habitIcon,
    habitFrequency,
    isSubmitting,
    formError,
    confirmArchiveHabitId,
    setHabitName,
    setHabitIcon,
    setHabitFrequency,
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
