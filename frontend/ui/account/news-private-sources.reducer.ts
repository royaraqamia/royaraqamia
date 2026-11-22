import type { NewsOwnedSource, NewsOwnedSourcesSummary } from '@/shared/contracts/news';

/**
 * The private-sources list reads one summary, reads it again after a delete, and
 * holds the row whose removal is being confirmed. The read wrote the summary, its
 * failure and the spinner together; the delete wrote the confirm target and the
 * busy id, so the list is one state here.
 */
export interface NewsPrivateSourcesState {
  summary: NewsOwnedSourcesSummary | null;
  loading: boolean;
  loadError: string | null;
  /** The row the confirmation sheet is naming, or null when it is closed. */
  removing: NewsOwnedSource | null;
  /** The row whose delete is in flight. */
  busyId: string | null;
}

export type NewsPrivateSourcesAction =
  | { type: 'loadStarted' }
  | { type: 'readSucceeded'; summary: NewsOwnedSourcesSummary }
  | { type: 'readFailed'; error: string }
  | { type: 'loadSettled' }
  | { type: 'removeRequested'; row: NewsOwnedSource }
  | { type: 'removeClosed' }
  | { type: 'removeStarted'; id: string }
  | { type: 'removeSettled' };

export function newsPrivateSourcesInitialState(): NewsPrivateSourcesState {
  return {
    summary: null,
    loading: true,
    loadError: null,
    removing: null,
    busyId: null,
  };
}

export function newsPrivateSourcesReducer(
  state: NewsPrivateSourcesState,
  action: NewsPrivateSourcesAction
): NewsPrivateSourcesState {
  switch (action.type) {
    case 'loadStarted':
      return { ...state, loading: true };

    case 'readSucceeded':
      return { ...state, summary: action.summary, loadError: null };

    case 'readFailed':
      return { ...state, loadError: action.error };

    case 'loadSettled':
      return state.loading ? { ...state, loading: false } : state;

    case 'removeRequested':
      return { ...state, removing: action.row };

    // The sheet closes after an accepted delete or on cancel; after a delete the
    // list is read back, so its counts come from the server rather than a patch.
    case 'removeClosed':
      return { ...state, removing: null };

    case 'removeStarted':
      return { ...state, busyId: action.id };

    case 'removeSettled':
      return state.busyId === null ? state : { ...state, busyId: null };
  }
}
