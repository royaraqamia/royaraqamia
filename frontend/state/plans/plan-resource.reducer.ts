/**
 * One account resource the plans surface reads: the value, the request that
 * fills it, and whether that request failed. `useMyUsage` and `useMyPlan` each
 * wrote these three separately around one request, so each load is one
 * transition here.
 */
export interface PlanResourceState<T> {
  value: T | null;
  loading: boolean;
  failed: boolean;
}

export type PlanResourceAction<T> =
  | { type: 'loadStarted' }
  | { type: 'loadSucceeded'; value: T }
  | { type: 'loadFailed' }
  | { type: 'disabled' };

export function planResourceInitialState<T>(loading: boolean): PlanResourceState<T> {
  return { value: null, loading, failed: false };
}

export function planResourceReducer<T>(
  state: PlanResourceState<T>,
  action: PlanResourceAction<T>
): PlanResourceState<T> {
  switch (action.type) {
    case 'loadStarted':
      return { ...state, loading: true, failed: false };

    case 'loadSucceeded':
      return { value: action.value, loading: false, failed: false };

    // The value stays as it was: a reload that fails shows the reason beside
    // the last answer rather than blanking the card.
    case 'loadFailed':
      return { ...state, loading: false, failed: true };

    // A visitor or a resolving session asks for nothing and pops the value; the
    // previous failure is left alone, as it was before the reducer existed.
    case 'disabled':
      return { ...state, value: null, loading: false };
  }
}
