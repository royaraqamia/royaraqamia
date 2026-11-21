import type { AdminPlansResult } from '@/frontend/api/admin/plans';

/** One page of plan users, the request that fills it, and why it failed. */
export interface AdminPlansState {
  result: AdminPlansResult | null;
  loading: boolean;
  error: string | null;
}

export type AdminPlansAction =
  | { type: 'loadStarted' }
  | { type: 'loadSucceeded'; result: AdminPlansResult }
  | { type: 'loadFailed'; message: string };

export function adminPlansInitialState(): AdminPlansState {
  return { result: null, loading: true, error: null };
}

/**
 * A reload is one transition: the spinner rises as the previous error clears,
 * and the page, the failure and the spinner settle together. The last page
 * stays painted while a reload runs, which is what a paged table wants.
 */
export function adminPlansReducer(
  state: AdminPlansState,
  action: AdminPlansAction
): AdminPlansState {
  switch (action.type) {
    case 'loadStarted':
      return { ...state, loading: true, error: null };

    case 'loadSucceeded':
      return { result: action.result, loading: false, error: null };

    case 'loadFailed':
      return { ...state, loading: false, error: action.message };
  }
}
