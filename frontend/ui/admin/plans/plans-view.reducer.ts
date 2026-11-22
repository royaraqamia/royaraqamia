import type { AdminUserUsage } from '@/shared/contracts/plans';

/** The list's query (page and applied search) and the row whose dialog is open. */
export interface PlansViewState {
  page: number;
  searchInput: string;
  search: string;
  selected: AdminUserUsage | null;
}

export type PlansViewAction =
  | { type: 'searchInputChanged'; value: string }
  | { type: 'searchSubmitted' }
  | { type: 'previousPage' }
  | { type: 'nextPage' }
  | { type: 'userSelected'; user: AdminUserUsage }
  | { type: 'dialogClosed' };

export function plansViewInitialState(): PlansViewState {
  return { page: 1, searchInput: '', search: '', selected: null };
}

/**
 * Submitting a search applies the draft and returns to the first page in one
 * transition, and each pager button reads the current page to clamp itself.
 */
export function plansViewReducer(state: PlansViewState, action: PlansViewAction): PlansViewState {
  switch (action.type) {
    case 'searchInputChanged':
      return { ...state, searchInput: action.value };

    case 'searchSubmitted':
      return { ...state, search: state.searchInput.trim(), page: 1 };

    case 'previousPage':
      return { ...state, page: Math.max(1, state.page - 1) };

    case 'nextPage':
      return { ...state, page: state.page + 1 };

    case 'userSelected':
      return { ...state, selected: action.user };

    case 'dialogClosed':
      return { ...state, selected: null };
  }
}
