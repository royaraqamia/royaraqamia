import {
  TRAINING_COHORT_CAPACITY_MAX,
  TRAINING_COHORT_DEFAULT_CAPACITY,
  type TrainingCohort,
  type TrainingCohortStatus,
} from '@/shared/contracts/training';

export interface CohortDraft {
  label: string;
  starts_at: string;
  capacity: string;
  status: TrainingCohortStatus;
}

export const EMPTY_DRAFT: CohortDraft = {
  label: '',
  starts_at: '',
  capacity: String(TRAINING_COHORT_DEFAULT_CAPACITY),
  status: 'open',
};

/** The date input is date-only; the stored timestamp is trimmed to its calendar day. */
export function toDateInputValue(startsAt: string): string {
  return startsAt.slice(0, 10);
}

export function draftOf(cohort: TrainingCohort): CohortDraft {
  return {
    label: cohort.label,
    starts_at: toDateInputValue(cohort.starts_at),
    capacity: String(cohort.capacity),
    status: cohort.status,
  };
}

/**
 * The cohorts list and the form that edits it. Opening the form for a cohort
 * wrote four values at once (which row, its draft, the errors, visibility), and
 * closing it wrote one; those are one transition each here.
 */
export interface CohortsState {
  cohorts: TrainingCohort[];
  loading: boolean;
  showForm: boolean;
  /** The cohort being edited, or null while creating. */
  editingId: string | null;
  draft: CohortDraft;
  fieldErrors: Record<string, string>;
  saving: boolean;
  /** The cohort whose status update is in flight. */
  togglingId: string | null;
}

export type CohortsAction =
  | { type: 'loadStarted' }
  | { type: 'loaded'; cohorts: TrainingCohort[] }
  | { type: 'createStarted' }
  | { type: 'editStarted'; cohort: TrainingCohort }
  | { type: 'formClosed' }
  | { type: 'draftChanged'; patch: Partial<CohortDraft> }
  | { type: 'validationFailed'; fieldErrors: Record<string, string> }
  | { type: 'saveStarted' }
  | { type: 'saveFinished' }
  | { type: 'toggleStarted'; id: string }
  | { type: 'toggleFinished' };

export function cohortsInitialState(): CohortsState {
  return {
    cohorts: [],
    loading: true,
    showForm: false,
    editingId: null,
    draft: EMPTY_DRAFT,
    fieldErrors: {},
    saving: false,
    togglingId: null,
  };
}

/** Every draft problem, keyed by field — empty when the draft may be sent. */
export function draftErrors(draft: CohortDraft): Record<string, string> {
  const errors: Record<string, string> = {};

  if (draft.label.trim().length < 2) errors.label = 'العنوان يجب أن يكون حرفين على الأقل';
  if (!draft.starts_at) errors.starts_at = 'تاريخ البدء مطلوب';

  const capacity = Number(draft.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > TRAINING_COHORT_CAPACITY_MAX) {
    errors.capacity = `عدد المقاعد يجب أن يكون بين 1 و${TRAINING_COHORT_CAPACITY_MAX}`;
  }

  return errors;
}

export function cohortsReducer(state: CohortsState, action: CohortsAction): CohortsState {
  switch (action.type) {
    case 'loadStarted':
      return { ...state, loading: true };

    case 'loaded':
      return { ...state, cohorts: action.cohorts, loading: false };

    case 'createStarted':
      return {
        ...state,
        editingId: null,
        draft: EMPTY_DRAFT,
        fieldErrors: {},
        showForm: true,
      };

    case 'editStarted':
      return {
        ...state,
        editingId: action.cohort.id,
        draft: draftOf(action.cohort),
        fieldErrors: {},
        showForm: true,
      };

    case 'formClosed':
      return { ...state, showForm: false };

    case 'draftChanged':
      return { ...state, draft: { ...state.draft, ...action.patch } };

    case 'validationFailed':
      return { ...state, fieldErrors: action.fieldErrors };

    case 'saveStarted':
      return { ...state, saving: true };

    case 'saveFinished':
      return { ...state, saving: false };

    case 'toggleStarted':
      return { ...state, togglingId: action.id };

    case 'toggleFinished':
      return state.togglingId === null ? state : { ...state, togglingId: null };
  }
}
