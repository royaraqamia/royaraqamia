import { useCallback, useReducer, useRef, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';
import { Habit, HabitRepository, HabitTargetPeriod } from '@/shared/contracts/habitflow';
import { showActionError } from '@/frontend/ui/plans/show-plan-error';
import {
  dashboardFormInitialState,
  dashboardFormReducer,
  type DashboardFormState,
  type HabitDraftFields,
} from './use-dashboard-form.reducer';

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

/**
 * The dashboard's habit form.
 *
 * The state is one reducer, but the setters it returns keep the shape callers
 * already have — `Dispatch<SetStateAction<T>>`, stable by identity — because the
 * dashboard lists `setIsAddModalOpen` and `setFormError` in an effect's
 * dependency array. Each one resolves a functional update against the latest
 * committed state through a ref, so `dispatch` staying stable does not change
 * what a caller may pass it.
 */
export function useDashboardForm(
  store: HabitRepository | null,
  setHabits: Dispatch<SetStateAction<Habit[]>>,
  habits: Habit[]
): DashboardForm {
  const [state, dispatch] = useReducer(dashboardFormReducer, undefined, dashboardFormInitialState);
  const latest = useRef<DashboardFormState>(state);
  latest.current = state;

  const patchField = useCallback(
    <K extends keyof HabitDraftFields>(key: K, value: HabitDraftFields[K]) => {
      dispatch({ type: 'fieldsPatched', patch: { [key]: value } as Partial<HabitDraftFields> });
    },
    []
  );

  const fieldSetter = useCallback(
    <K extends keyof HabitDraftFields>(key: K): Dispatch<SetStateAction<HabitDraftFields[K]>> =>
      (action) => {
        const current = latest.current[key];
        const value =
          typeof action === 'function'
            ? (action as (prev: HabitDraftFields[K]) => HabitDraftFields[K])(current)
            : action;
        patchField(key, value);
      },
    [patchField]
  );

  // One stable setter per field, resolved once per hook instance.
  const setHabitName = useCallback<Dispatch<SetStateAction<string>>>(
    (action) => fieldSetter('habitName')(action),
    [fieldSetter]
  );
  const setHabitFrequency = useCallback<Dispatch<SetStateAction<'daily' | 'weekly'>>>(
    (action) => fieldSetter('habitFrequency')(action),
    [fieldSetter]
  );
  const setHabitTarget = useCallback<Dispatch<SetStateAction<string>>>(
    (action) => fieldSetter('habitTarget')(action),
    [fieldSetter]
  );
  const setHabitTargetPeriod = useCallback<Dispatch<SetStateAction<HabitTargetPeriod | ''>>>(
    (action) => fieldSetter('habitTargetPeriod')(action),
    [fieldSetter]
  );
  const setHabitReminderTime = useCallback<Dispatch<SetStateAction<string>>>(
    (action) => fieldSetter('habitReminderTime')(action),
    [fieldSetter]
  );
  const setIsAddModalOpen = useCallback<Dispatch<SetStateAction<boolean>>>((action) => {
    const open = typeof action === 'function' ? action(latest.current.isAddModalOpen) : action;
    dispatch({ type: 'addModalSet', open });
  }, []);
  const setFormError = useCallback<Dispatch<SetStateAction<string>>>((action) => {
    const current = latest.current.formError;
    const message = typeof action === 'function' ? action(current) : action;
    dispatch({ type: 'formErrorSet', message });
  }, []);

  const handleAddHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    dispatch({ type: 'formErrorSet', message: '' });
    if (!state.habitName.trim()) return;
    if (!store) {
      dispatch({
        type: 'formErrorSet',
        message: 'جاري تجهيز التخزين المحلِّي. يرجى المحاولة بعد لحظة.',
      });
      return;
    }
    dispatch({ type: 'submitStarted' });
    try {
      const habit = await store.createHabit({
        name: state.habitName.trim(),
        frequency: state.habitFrequency,
        target: parseTarget(state.habitTarget),
        targetPeriod: state.habitTargetPeriod === '' ? null : state.habitTargetPeriod,
        reminderTime: state.habitReminderTime === '' ? null : state.habitReminderTime,
      });
      setHabits((prev) => [...prev, habit]);
      dispatch({ type: 'createSucceeded' });
      toast.success('تم إنشاء العادة بنجاح');
    } catch (error) {
      // A reached cap throws with its own copy; the form shows it as-is.
      dispatch({
        type: 'submitFailed',
        message: showActionError(error, 'فشل إنشاء العادة'),
      });
    } finally {
      dispatch({ type: 'submitFinished' });
    }
  };

  const handleEditHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    dispatch({ type: 'formErrorSet', message: '' });
    if (!state.selectedHabit || !state.habitName.trim()) return;
    if (!store) {
      dispatch({
        type: 'formErrorSet',
        message: 'جاري تجهيز التخزين المحلِّي. يرجى المحاولة بعد لحظة.',
      });
      return;
    }
    dispatch({ type: 'submitStarted' });
    try {
      const updated = await store.updateHabit(state.selectedHabit.id, {
        name: state.habitName.trim(),
        frequency: state.habitFrequency,
        target: parseTarget(state.habitTarget),
        targetPeriod: state.habitTargetPeriod === '' ? null : state.habitTargetPeriod,
        reminderTime: state.habitReminderTime === '' ? null : state.habitReminderTime,
      });
      setHabits((prev) => prev.map((h) => (h.id === state.selectedHabit?.id ? updated : h)));
      dispatch({ type: 'editSucceeded' });
      toast.success('تم تحديث العادة بنجاح');
    } catch {
      dispatch({
        type: 'submitFailed',
        message: 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.',
      });
      toast.error('فشل تحديث العادة');
    } finally {
      dispatch({ type: 'submitFinished' });
    }
  };

  const handleArchiveHabit = (habitId: string) => {
    dispatch({ type: 'archiveStarted', habitId });
  };

  const confirmArchive = async () => {
    const confirmArchiveHabitId = state.confirmArchiveHabitId;
    if (!confirmArchiveHabitId || !store) return;
    dispatch({ type: 'formErrorSet', message: '' });

    const archivedHabit = habits.find((h) => h.id === confirmArchiveHabitId);
    const storeRef = store;
    const id = confirmArchiveHabitId;

    const showUndoToast = (title: string) => {
      toast(title, {
        action: {
          label: 'تراجع',
          onClick: async () => {
            if (!archivedHabit) return;
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
      const success = await store.deleteHabit(id);
      if (!success) {
        dispatch({
          type: 'archiveFailed',
          message: 'فشل في أرشفة العادة. يرجى المحاولة مرة أخرى.',
        });
        return;
      }
      setHabits((prev) => prev.filter((h) => h.id !== id));
      dispatch({ type: 'archiveSucceeded' });
      showUndoToast('تم أرشفة العادة');
    } catch {
      dispatch({
        type: 'archiveFailed',
        message: 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.',
      });
      toast.error('فشل أرشفة العادة');
    }
  };

  const cancelArchive = () => {
    dispatch({ type: 'archiveCancelled' });
  };

  const openEditModal = (habit: Habit) => {
    dispatch({ type: 'editOpened', habit });
  };

  const closeEditModal = () => {
    dispatch({ type: 'editClosed' });
  };

  return {
    isAddModalOpen: state.isAddModalOpen,
    isEditModalOpen: state.isEditModalOpen,
    selectedHabit: state.selectedHabit,
    habitName: state.habitName,
    habitFrequency: state.habitFrequency,
    habitTarget: state.habitTarget,
    habitTargetPeriod: state.habitTargetPeriod,
    habitReminderTime: state.habitReminderTime,
    isSubmitting: state.isSubmitting,
    formError: state.formError,
    confirmArchiveHabitId: state.confirmArchiveHabitId,
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
