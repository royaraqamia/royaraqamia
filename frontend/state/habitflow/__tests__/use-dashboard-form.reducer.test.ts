import { describe, expect, it } from 'vitest';
import type { Habit } from '@/shared/contracts/habitflow';
import {
  dashboardFormInitialState,
  dashboardFormReducer,
  EMPTY_HABIT_FIELDS,
  type DashboardFormState,
} from '@/frontend/state/habitflow/use-dashboard-form.reducer';

const HABIT = {
  id: 'h-1',
  name: 'قراءة',
  frequency: 'weekly',
  target: 3,
  targetPeriod: 'week',
  reminderTime: '20:30',
} as unknown as Habit;

function stateOf(patch: Partial<DashboardFormState> = {}): DashboardFormState {
  return { ...dashboardFormInitialState(), ...patch };
}

describe('dashboardFormInitialState', () => {
  it('starts closed, with an empty draft and no error', () => {
    expect(dashboardFormInitialState()).toEqual({
      ...EMPTY_HABIT_FIELDS,
      isAddModalOpen: false,
      isEditModalOpen: false,
      selectedHabit: null,
      isSubmitting: false,
      formError: '',
      confirmArchiveHabitId: null,
    });
  });
});

describe('opening the edit modal', () => {
  it('drafts the habit and clears the error in one transition', () => {
    const state = dashboardFormReducer(stateOf({ formError: 'فشل' }), {
      type: 'editOpened',
      habit: HABIT,
    });

    expect(state).toMatchObject({
      selectedHabit: HABIT,
      habitName: 'قراءة',
      habitFrequency: 'weekly',
      habitTarget: '3',
      habitTargetPeriod: 'week',
      habitReminderTime: '20:30',
      isEditModalOpen: true,
      formError: '',
    });
  });

  it('leaves an empty field empty when the habit has no target or time', () => {
    const bare = { id: 'h-2', name: 'مشي', frequency: 'daily' } as unknown as Habit;

    expect(dashboardFormReducer(stateOf(), { type: 'editOpened', habit: bare })).toMatchObject({
      habitTarget: '',
      habitTargetPeriod: '',
      habitReminderTime: '',
    });
  });

  it('forgets the habit and the draft when it closes', () => {
    const opened = dashboardFormReducer(stateOf(), { type: 'editOpened', habit: HABIT });
    const closed = dashboardFormReducer(opened, { type: 'editClosed' });

    expect(closed).toMatchObject({ isEditModalOpen: false, selectedHabit: null, formError: '' });
    expect(closed.habitName).toBe('');
  });
});

describe('the draft', () => {
  it('patches one field at a time', () => {
    const state = dashboardFormReducer(stateOf(), {
      type: 'fieldsPatched',
      patch: { habitTarget: '5', habitFrequency: 'weekly' },
    });

    expect(state).toMatchObject({ habitTarget: '5', habitFrequency: 'weekly' });
    expect(state.habitName).toBe('');
  });
});

describe('submitting', () => {
  it('clears the error and raises the flag', () => {
    expect(
      dashboardFormReducer(stateOf({ formError: 'فشل' }), { type: 'submitStarted' })
    ).toMatchObject({ isSubmitting: true, formError: '' });
  });

  it('closes the add modal and clears the draft on success', () => {
    const state = dashboardFormReducer(
      stateOf({ isAddModalOpen: true, habitName: 'قراءة', habitTarget: '2' }),
      { type: 'createSucceeded' }
    );

    expect(state).toMatchObject({ isAddModalOpen: false, habitName: '', habitTarget: '' });
  });

  it('closes the edit modal, forgets the habit and clears the draft on success', () => {
    const state = dashboardFormReducer(
      stateOf({ isEditModalOpen: true, selectedHabit: HABIT, habitName: 'قراءة' }),
      { type: 'editSucceeded' }
    );

    expect(state).toMatchObject({
      isEditModalOpen: false,
      selectedHabit: null,
      habitName: '',
      formError: '',
    });
  });

  it('keeps the draft and shows the reason when the request fails', () => {
    const state = dashboardFormReducer(stateOf({ isSubmitting: true, habitName: 'قراءة' }), {
      type: 'submitFailed',
      message: 'فشل',
    });

    expect(state).toMatchObject({ formError: 'فشل', habitName: 'قراءة', isSubmitting: true });
    expect(dashboardFormReducer(state, { type: 'submitFinished' }).isSubmitting).toBe(false);
  });
});

describe('archiving', () => {
  it('closes the edit modal and asks for confirmation of the row', () => {
    expect(
      dashboardFormReducer(stateOf({ isEditModalOpen: true }), {
        type: 'archiveStarted',
        habitId: 'h-1',
      })
    ).toMatchObject({ isEditModalOpen: false, confirmArchiveHabitId: 'h-1' });
  });

  it('reopens the edit modal when the confirmation is dismissed', () => {
    expect(
      dashboardFormReducer(stateOf({ confirmArchiveHabitId: 'h-1' }), {
        type: 'archiveCancelled',
      })
    ).toMatchObject({ isEditModalOpen: true, confirmArchiveHabitId: null });
  });

  it('reports a failure and drops the confirmation', () => {
    const state = dashboardFormReducer(stateOf({ confirmArchiveHabitId: 'h-1' }), {
      type: 'archiveFailed',
      message: 'فشل',
    });

    expect(state).toMatchObject({ formError: 'فشل', confirmArchiveHabitId: null });
  });

  it('forgets the habit once it is archived', () => {
    expect(
      dashboardFormReducer(
        stateOf({ confirmArchiveHabitId: 'h-1', selectedHabit: HABIT, formError: 'فشل' }),
        { type: 'archiveSucceeded' }
      )
    ).toMatchObject({
      selectedHabit: null,
      confirmArchiveHabitId: null,
      formError: '',
      isEditModalOpen: false,
    });
  });
});
