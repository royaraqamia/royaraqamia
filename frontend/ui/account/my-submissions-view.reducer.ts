import type { ProjectRequest } from '@/shared/contracts/project-requests';
import type { Retainer } from '@/shared/contracts/retainers';
import type { TrainingApplication } from '@/shared/contracts/training';
import type { ConsultationBooking } from '@/shared/contracts/consultation';

/**
 * The account's submissions view reads four intake lists at once and lets one
 * row be edited in place. The read wrote six values in one go (four lists and
 * two failure flags), and every save wrote a list plus the editing key, so the
 * whole view is one state here.
 */
export interface SubmissionsState {
  projectRequests: ProjectRequest[] | null;
  retainers: Retainer[] | null;
  applications: TrainingApplication[] | null;
  bookings: ConsultationBooking[] | null;
  /** Which row is open in its edit form, as `<kind>:<id>`. */
  editingKey: string | null;
  loadFailed: boolean;
  /** True when the failure was a request that never reached the server. */
  loadOffline: boolean;
}

export interface SubmissionsPayload {
  projectRequests: ProjectRequest[];
  retainers: Retainer[];
  applications: TrainingApplication[];
  bookings: ConsultationBooking[];
}

export type SubmissionsAction =
  | { type: 'loadStarted' }
  | ({ type: 'loaded' } & SubmissionsPayload)
  | { type: 'loadFailed'; offline: boolean }
  | { type: 'editStarted'; key: string }
  | { type: 'editStopped' }
  | { type: 'projectRequestSaved'; request: ProjectRequest }
  | { type: 'retainerSaved'; retainer: Retainer }
  | { type: 'applicationSaved'; application: TrainingApplication }
  | { type: 'bookingSaved'; booking: ConsultationBooking };

export function submissionsInitialState(): SubmissionsState {
  return {
    projectRequests: null,
    retainers: null,
    applications: null,
    bookings: null,
    editingKey: null,
    loadFailed: false,
    loadOffline: false,
  };
}

/** Replaces one row, leaving the list alone when it has not arrived yet. */
function replaceRow<Row extends { id: string }>(rows: Row[] | null, updated: Row): Row[] | null {
  return rows?.map((row) => (row.id === updated.id ? updated : row)) ?? rows;
}

export function submissionsReducer(
  state: SubmissionsState,
  action: SubmissionsAction
): SubmissionsState {
  switch (action.type) {
    case 'loadStarted':
      return { ...state, loadFailed: false, loadOffline: false };

    case 'loaded':
      return {
        ...state,
        projectRequests: action.projectRequests,
        retainers: action.retainers,
        applications: action.applications,
        bookings: action.bookings,
      };

    case 'loadFailed':
      return { ...state, loadFailed: true, loadOffline: action.offline };

    case 'editStarted':
      return { ...state, editingKey: action.key };

    case 'editStopped':
      return state.editingKey === null ? state : { ...state, editingKey: null };

    case 'projectRequestSaved':
      return {
        ...state,
        projectRequests: replaceRow(state.projectRequests, action.request),
        editingKey: null,
      };

    case 'retainerSaved':
      return {
        ...state,
        retainers: replaceRow(state.retainers, action.retainer),
        editingKey: null,
      };

    case 'applicationSaved':
      return {
        ...state,
        applications: replaceRow(state.applications, action.application),
        editingKey: null,
      };

    case 'bookingSaved':
      return {
        ...state,
        bookings: replaceRow(state.bookings, action.booking),
        editingKey: null,
      };
  }
}
