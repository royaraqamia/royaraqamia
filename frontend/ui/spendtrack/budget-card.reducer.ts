/** The month's budget, its draft input, the load, and the save. */
export interface BudgetCardState {
  budget: number | null;
  input: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

export type BudgetCardAction =
  | { type: 'loaded'; budget: number | null }
  | { type: 'loadFailed'; message: string }
  | { type: 'inputChanged'; input: string }
  | { type: 'saveStarted' }
  | { type: 'saveSucceeded'; budget: number }
  | { type: 'saveFailed'; message: string };

export function budgetCardInitialState(): BudgetCardState {
  return { budget: null, input: '', loading: true, saving: false, error: null };
}

/**
 * A load paints the budget and its draft together, and a save raises its flag
 * as the previous error clears. Those were four separate writes on load and
 * three around a save, so each is one transition here.
 */
export function budgetCardReducer(
  state: BudgetCardState,
  action: BudgetCardAction
): BudgetCardState {
  switch (action.type) {
    case 'loaded':
      return {
        ...state,
        budget: action.budget,
        input: action.budget != null ? String(action.budget) : '',
        loading: false,
      };

    case 'loadFailed':
      return { ...state, loading: false, error: action.message };

    case 'inputChanged':
      return { ...state, input: action.input };

    case 'saveStarted':
      return { ...state, saving: true, error: null };

    case 'saveSucceeded':
      return { ...state, budget: action.budget, saving: false, error: null };

    case 'saveFailed':
      return { ...state, saving: false, error: action.message };
  }
}
