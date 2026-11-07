/**
 * The rows a bulk action is about to touch, and the run that touches them: the
 * ids selected, whether the call is in flight and the sentence a refusal leaves.
 *
 * The selection is a `Set` carried from the previous state (toggling adds or
 * removes one id, "select all" flips the whole list), and the run writes the
 * other two together — so all three are one state here.
 */
export interface BulkPostsData {
  selected: Set<string>;
  busy: boolean;
  error: string | null;
}

export type BulkPostsAction =
  | { type: 'toggled'; id: string }
  /** Select every id, or clear when every id is already selected. */
  | { type: 'allToggled'; ids: string[] }
  | { type: 'cleared' }
  | { type: 'runStarted' }
  | { type: 'runFailed'; message: string }
  | { type: 'runFinished' };

export function bulkPostsInitialState(): BulkPostsData {
  return { selected: new Set(), busy: false, error: null };
}

export function bulkPostsReducer(state: BulkPostsData, action: BulkPostsAction): BulkPostsData {
  switch (action.type) {
    case 'toggled': {
      const next = new Set(state.selected);
      if (next.has(action.id)) {
        next.delete(action.id);
      } else {
        next.add(action.id);
      }
      return { ...state, selected: next };
    }

    case 'allToggled': {
      const everyRowSelected = state.selected.size === action.ids.length && state.selected.size > 0;
      return { ...state, selected: everyRowSelected ? new Set() : new Set(action.ids) };
    }

    case 'cleared':
      return { ...state, selected: new Set() };

    case 'runStarted':
      return { ...state, busy: true, error: null };

    case 'runFailed':
      return { ...state, error: action.message };

    case 'runFinished':
      return { ...state, busy: false };
  }
}
