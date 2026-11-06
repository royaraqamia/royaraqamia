import type { Habit, HabitTargetPeriod } from '@/shared/contracts/habitflow';

/** The five draft fields one habit form edits. */
export interface HabitDraftFields {
  habitName: string;
  habitFrequency: 'daily' | 'weekly';
  habitTarget: string;
  habitTargetPeriod: HabitTargetPeriod | '';
  habitReminderTime: string;
}

export const EMPTY_HABIT_FIELDS: HabitDraftFields = {
  habitName: '',
  habitFrequency: 'daily',
  habitTarget: '',
  habitTargetPeriod: '',
  habitReminderTime: '',
};

/**
 * The dashboard's habit form: the draft it edits, the modal it is drawn in, and
 * the request that submits it. Opening the edit modal wrote six of these at once
 * and `resetFields()` wrote five more, so each is one transition here.
 */
export interface DashboardFormState extends HabitDraftFields {
  isAddModalOpen: boolean;
  isEditModalOpen: boolean;
  selectedHabit: Habit | null;
  isSubmitting: boolean;
  formError: string;
  confirmArchiveHabitId: string | null;
}

export type DashboardFormAction =
  | { type: 'fieldsPatched'; patch: Partial<HabitDraftFields> }
  | { type: 'addModalSet'; open: boolean }
  | { type: 'formErrorSet'; message: string }
  | { type: 'editOpened'; habit: Habit }
  | { type: 'editClosed' }
  | { type: 'submitStarted' }
  | { type: 'submitFailed'; message: string }
  | { type: 'submitFinished' }
  | { type: 'createSucceeded' }
  | { type: 'editSucceeded' }
  | { type: 'archiveStarted'; habitId: string }
  | { type: 'archiveCancelled' }
  | { type: 'archiveFailed'; message: string }
  | { type: 'archiveSucceeded' };

export function dashboardFormInitialState(): DashboardFormState {
  return {
    ...EMPTY_HABIT_FIELDS,
    isAddModalOpen: false,
    isEditModalOpen: false,
    selectedHabit: null,
    isSubmitting: false,
    formError: '',
    confirmArchiveHabitId: null,
  };
}

export function dashboardFormReducer(
  state: DashboardFormState,
  action: DashboardFormAction
): DashboardFormState {
  switch (action.type) {
    case 'fieldsPatched':
      return { ...state, ...action.patch };

    case 'addModalSet':
      return { ...state, isAddModalOpen: action.open };

    case 'formErrorSet':
      return { ...state, formError: action.message };

    case 'editOpened':
      return {
        ...state,
        selectedHabit: action.habit,
        habitName: action.habit.name,
        habitFrequency: action.habit.frequency,
        habitTarget: action.habit.target != null ? String(action.habit.target) : '',
        habitTargetPeriod: action.habit.targetPeriod ?? '',
        habitReminderTime: action.habit.reminderTime ?? '',
        isEditModalOpen: true,
        formError: '',
      };

    case 'editClosed':
      return {
        ...state,
        isEditModalOpen: false,
        selectedHabit: null,
        ...EMPTY_HABIT_FIELDS,
        formError: '',
      };

    case 'submitStarted':
      return { ...state, isSubmitting: true, formError: '' };

    case 'submitFailed':
      return { ...state, formError: action.message };

    case 'submitFinished':
      return { ...state, isSubmitting: false };

    case 'createSucceeded':
      return { ...state, isAddModalOpen: false, ...EMPTY_HABIT_FIELDS, formError: '' };

    case 'editSucceeded':
      return {
        ...state,
        isEditModalOpen: false,
        selectedHabit: null,
        ...EMPTY_HABIT_FIELDS,
        formError: '',
      };

    case 'archiveStarted':
      return { ...state, isEditModalOpen: false, confirmArchiveHabitId: action.habitId };

    case 'archiveCancelled':
      return { ...state, isEditModalOpen: true, confirmArchiveHabitId: null };

    case 'archiveFailed':
      return { ...state, formError: action.message, confirmArchiveHabitId: null };

    case 'archiveSucceeded':
      return {
        ...state,
        isEditModalOpen: false,
        selectedHabit: null,
        formError: '',
        confirmArchiveHabitId: null,
      };
  }
}
