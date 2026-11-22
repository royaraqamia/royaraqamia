import type { ReadFailure } from '@/frontend/ui/shared/read-failure';
import type { NewsSearchSuggestion } from '@/shared/contracts/news';

/**
 * The suggestion panel under the `/news` search box.
 *
 * One debounced request owns five flags at once — the hits it painted, whether
 * the panel is open, whether it is still loading, the failure it named, and the
 * highlighted row — so they live in one state machine rather than five setters
 * that can disagree. `attempt` is the retry nonce the request effect watches;
 * it is bumped rather than the same query re-run so a retry asks again.
 */
export interface NewsSearchState {
  hits: NewsSearchSuggestion[];
  open: boolean;
  loading: boolean;
  error: ReadFailure | null;
  attempt: number;
  active: number;
}

export type NewsSearchAction =
  | { type: 'reset' }
  | { type: 'errorCleared' }
  | { type: 'requested' }
  | { type: 'succeeded'; hits: NewsSearchSuggestion[] }
  | { type: 'failed'; error: ReadFailure }
  | { type: 'finished' }
  | { type: 'retryRequested' }
  | { type: 'opened' }
  | { type: 'closed' }
  | { type: 'dismissed' }
  | { type: 'activeSet'; index: number }
  | { type: 'activeMoved'; delta: number; rowCount: number };

export function newsSearchInitialState(): NewsSearchState {
  return { hits: [], open: false, loading: false, error: null, attempt: 0, active: -1 };
}

export function newsSearchReducer(
  state: NewsSearchState,
  action: NewsSearchAction
): NewsSearchState {
  switch (action.type) {
    case 'reset':
      return { ...state, hits: [], open: false, loading: false, error: null, active: -1 };

    case 'errorCleared':
      return state.error === null ? state : { ...state, error: null };

    case 'requested':
      return { ...state, loading: true, error: null };

    case 'succeeded':
      return {
        ...state,
        hits: action.hits,
        error: null,
        open: true,
        active: -1,
      };

    case 'failed':
      return {
        ...state,
        hits: [],
        error: action.error,
        open: true,
        active: -1,
      };

    case 'finished':
      return state.loading ? { ...state, loading: false } : state;

    case 'retryRequested':
      return { ...state, loading: true, attempt: state.attempt + 1 };

    case 'opened':
      return state.open ? state : { ...state, open: true };

    case 'closed':
      return state.open ? { ...state, open: false } : state;

    case 'dismissed':
      return { ...state, open: false, active: -1 };

    case 'activeSet':
      return { ...state, active: action.index };

    case 'activeMoved':
      return {
        ...state,
        active: Math.min(Math.max(state.active + action.delta, -1), action.rowCount - 1),
      };
  }
}
