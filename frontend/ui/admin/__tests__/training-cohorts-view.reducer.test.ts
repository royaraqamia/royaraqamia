import { describe, expect, it } from 'vitest';
import type { TrainingCohort } from '@/shared/contracts/training';
import {
  cohortsInitialState,
  cohortsReducer,
  draftErrors,
  draftOf,
  EMPTY_DRAFT,
  toDateInputValue,
  type CohortsState,
} from '@/frontend/ui/admin/training-cohorts-view.reducer';

const COHORT = {
  id: 'c-1',
  label: 'الدُّفعة الأولى',
  starts_at: '2026-11-05T00:00:00.000Z',
  capacity: 12,
  status: 'open',
  seats_taken: 3,
} as unknown as TrainingCohort;

function stateOf(patch: Partial<CohortsState> = {}): CohortsState {
  return { ...cohortsInitialState(), ...patch };
}

describe('cohortsInitialState', () => {
  it('starts loading, with the form closed and an empty draft', () => {
    expect(cohortsInitialState()).toEqual({
      cohorts: [],
      loading: true,
      showForm: false,
      editingId: null,
      draft: EMPTY_DRAFT,
      fieldErrors: {},
      saving: false,
      togglingId: null,
    });
  });
});

describe('opening the form', () => {
  it('clears the row being edited and the errors when creating', () => {
    const state = cohortsReducer(
      stateOf({ editingId: 'c-1', fieldErrors: { label: 'خطأ' }, draft: { ...EMPTY_DRAFT } }),
      { type: 'createStarted' }
    );

    expect(state).toMatchObject({ editingId: null, fieldErrors: {}, showForm: true });
    expect(state.draft).toEqual(EMPTY_DRAFT);
  });

  it('fills the draft from the row being edited', () => {
    const state = cohortsReducer(stateOf({ fieldErrors: { label: 'خطأ' } }), {
      type: 'editStarted',
      cohort: COHORT,
    });

    expect(state).toMatchObject({ editingId: 'c-1', fieldErrors: {}, showForm: true });
    expect(state.draft).toEqual({
      label: 'الدُّفعة الأولى',
      starts_at: '2026-11-05',
      capacity: '12',
      status: 'open',
    });
  });

  it('closes without discarding the draft, as the page always did', () => {
    const edited = cohortsReducer(stateOf(), { type: 'editStarted', cohort: COHORT });
    const closed = cohortsReducer(edited, { type: 'formClosed' });

    expect(closed.showForm).toBe(false);
    expect(closed.editingId).toBe('c-1');
    expect(closed.draft).toEqual(edited.draft);
  });
});

describe('the draft', () => {
  it('merges one field at a time', () => {
    const state = cohortsReducer(stateOf(), {
      type: 'draftChanged',
      patch: { label: 'دفعة' },
    });

    expect(state.draft.label).toBe('دفعة');
    expect(state.draft.capacity).toBe(EMPTY_DRAFT.capacity);
  });

  it('keeps the errors a failed save produced until the next save', () => {
    const failed = cohortsReducer(stateOf(), {
      type: 'validationFailed',
      fieldErrors: { label: 'قصير' },
    });

    const typed = cohortsReducer(failed, { type: 'draftChanged', patch: { label: 'دفعة' } });

    expect(typed.draft.label).toBe('دفعة');
    expect(typed.fieldErrors).toEqual({ label: 'قصير' });
  });
});

describe('saving and toggling', () => {
  it('raises and lowers the save flag', () => {
    const saving = cohortsReducer(stateOf(), { type: 'saveStarted' });
    expect(saving.saving).toBe(true);
    expect(cohortsReducer(saving, { type: 'saveFinished' }).saving).toBe(false);
  });

  it('tracks the row whose status is in flight', () => {
    const toggling = cohortsReducer(stateOf(), { type: 'toggleStarted', id: 'c-1' });
    expect(toggling.togglingId).toBe('c-1');
    expect(cohortsReducer(toggling, { type: 'toggleFinished' }).togglingId).toBeNull();
  });

  it('lands a read and its rows together', () => {
    const state = cohortsReducer(stateOf({ loading: true }), {
      type: 'loaded',
      cohorts: [COHORT],
    });

    expect(state).toMatchObject({ cohorts: [COHORT], loading: false });
  });
});

describe('draftErrors', () => {
  it('accepts a complete draft', () => {
    expect(draftErrors(draftOf(COHORT))).toEqual({});
  });

  it('names every field that fails', () => {
    const errors = draftErrors({ label: ' ', starts_at: '', capacity: '0', status: 'open' });

    expect(Object.keys(errors).sort()).toEqual(['capacity', 'label', 'starts_at']);
  });

  it('refuses a capacity above the contract maximum', () => {
    expect(draftErrors({ ...draftOf(COHORT), capacity: '9999' }).capacity).toBeDefined();
  });

  it('refuses a fraction of a seat', () => {
    expect(draftErrors({ ...draftOf(COHORT), capacity: '2.5' }).capacity).toBeDefined();
  });
});

describe('toDateInputValue', () => {
  it('trims a timestamp to its calendar day', () => {
    expect(toDateInputValue('2026-11-05T00:00:00.000Z')).toBe('2026-11-05');
  });
});
