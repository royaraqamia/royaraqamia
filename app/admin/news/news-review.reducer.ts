import type {
  NewsCategory,
  NewsRegion,
  NewsSourceDestination,
  NewsSourceRequest,
  NewsSourceRequestStatus,
} from '@/shared/contracts/news';

export type NewsStatusFilter = NewsSourceRequestStatus | 'all';

/** The four facts an Admin sets on a request before approving it, plus the feed. */
export interface NewsDraft {
  category: NewsCategory;
  region: NewsRegion;
  tier: 1 | 2;
  note: string;
  feedUrl: string;
  destination: NewsSourceDestination;
}

/** What an untouched request offers: its resolved facts, or the queue's defaults. */
export function defaultNewsDraft(request: NewsSourceRequest): NewsDraft {
  return {
    category: request.category ?? 'world',
    region: request.region ?? 'world',
    tier: request.tier ?? 2,
    note: '',
    feedUrl: '',
    destination: 'private',
  };
}

/**
 * The reader-proposed source queue: the rows, the filter, the read in flight,
 * the row being decided and the draft each row is editing.
 *
 * `fetchData` wrote the rows and the loading flag together, `decide` wrote the
 * deciding row and replaced that row in the list, and every field edit merged
 * into that row's draft — so they are one state here.
 */
export interface NewsReviewState {
  requests: NewsSourceRequest[];
  statusFilter: NewsStatusFilter;
  loading: boolean;
  decidingId: string | null;
  drafts: Record<string, NewsDraft>;
}

export type NewsReviewAction =
  | { type: 'filterChanged'; filter: NewsStatusFilter }
  | { type: 'loadStarted' }
  | { type: 'loaded'; requests: NewsSourceRequest[] }
  | { type: 'loadFailed' }
  | { type: 'draftPatched'; request: NewsSourceRequest; patch: Partial<NewsDraft> }
  | { type: 'decideStarted'; id: string }
  | { type: 'decided'; request: NewsSourceRequest }
  | { type: 'decideFinished' };

export function newsReviewInitialState(statusFilter: NewsStatusFilter): NewsReviewState {
  return { requests: [], statusFilter, loading: true, decidingId: null, drafts: {} };
}

export function newsReviewReducer(
  state: NewsReviewState,
  action: NewsReviewAction
): NewsReviewState {
  switch (action.type) {
    case 'filterChanged':
      return { ...state, statusFilter: action.filter };

    case 'loadStarted':
      return { ...state, loading: true };

    case 'loaded':
      return { ...state, requests: action.requests, loading: false };

    case 'loadFailed':
      return { ...state, loading: false };

    case 'draftPatched': {
      const current = state.drafts[action.request.id] ?? defaultNewsDraft(action.request);
      return {
        ...state,
        drafts: { ...state.drafts, [action.request.id]: { ...current, ...action.patch } },
      };
    }

    case 'decideStarted':
      return { ...state, decidingId: action.id };

    case 'decided':
      return {
        ...state,
        requests: state.requests.map((row) =>
          row.id === action.request.id ? action.request : row
        ),
      };

    case 'decideFinished':
      return state.decidingId === null ? state : { ...state, decidingId: null };
  }
}
