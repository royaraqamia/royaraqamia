/**
 * The bulk bar's selection and the one action it is running: the codes ticked,
 * the request in flight and its sentence.
 *
 * Every tick built the next set from the previous one (`toggleAll` even reads
 * it to decide between "all" and "none"), and the action wrote the flag and the
 * error together — so they are one state here.
 */
export interface BulkLinksState {
  selected: Set<string>;
  busy: boolean;
  error: string | null;
}

export type BulkLinksAction =
  | { type: 'toggled'; code: string }
  | { type: 'allToggled'; codes: string[] }
  | { type: 'cleared' }
  | { type: 'runStarted' }
  | { type: 'runFailed'; message: string }
  | { type: 'runFinished' };

export function bulkLinksInitialState(): BulkLinksState {
  return { selected: new Set(), busy: false, error: null };
}

export function bulkLinksReducer(state: BulkLinksState, action: BulkLinksAction): BulkLinksState {
  switch (action.type) {
    case 'toggled': {
      const selected = new Set(state.selected);
      if (selected.has(action.code)) {
        selected.delete(action.code);
      } else {
        selected.add(action.code);
      }
      return { ...state, selected };
    }

    case 'allToggled':
      return {
        ...state,
        selected:
          state.selected.size === action.codes.length && state.selected.size > 0
            ? new Set()
            : new Set(action.codes),
      };

    case 'cleared':
      return { ...state, selected: new Set() };

    case 'runStarted':
      return { ...state, busy: true, error: null };

    case 'runFailed':
      return { ...state, error: action.message };

    case 'runFinished':
      return state.busy ? { ...state, busy: false } : state;
  }
}
