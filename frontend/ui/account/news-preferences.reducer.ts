import type { NewsSource } from '@/shared/contracts/news';

/**
 * The source checklist reads its rows and the account's ticks in one request, and
 * every tick is a set operation on the previous selection. The read and the save
 * also wrote their own busy and failure flags, so the picker is one state here.
 */
export interface NewsPreferencesState {
  sources: NewsSource[] | null;
  selected: Set<string>;
  loading: boolean;
  loadError: string | null;
  saving: boolean;
}

export type NewsPreferencesAction =
  | { type: 'loadStarted' }
  | { type: 'loadSucceeded'; sources: NewsSource[]; selected: string[] }
  | { type: 'loadFailed'; error: string }
  | { type: 'toggled'; id: string }
  | { type: 'allSelected'; ids: string[] }
  | { type: 'saveStarted' }
  | { type: 'saveSettled' };

export function newsPreferencesInitialState(): NewsPreferencesState {
  return {
    sources: null,
    selected: new Set(),
    loading: true,
    loadError: null,
    saving: false,
  };
}

export function newsPreferencesReducer(
  state: NewsPreferencesState,
  action: NewsPreferencesAction
): NewsPreferencesState {
  switch (action.type) {
    case 'loadStarted':
      return { ...state, loading: true, loadError: null };

    case 'loadSucceeded':
      return {
        ...state,
        sources: action.sources,
        selected: new Set(action.selected),
        loading: false,
        loadError: null,
      };

    case 'loadFailed':
      return { ...state, loading: false, loadError: action.error };

    case 'toggled': {
      const next = new Set(state.selected);
      if (next.has(action.id)) next.delete(action.id);
      else next.add(action.id);
      return { ...state, selected: next };
    }

    case 'allSelected':
      return { ...state, selected: new Set(action.ids) };

    case 'saveStarted':
      return { ...state, saving: true };

    case 'saveSettled':
      return state.saving ? { ...state, saving: false } : state;
  }
}
