/**
 * The submission lifecycle every auth form shares: the sentence it shows, whether
 * that sentence is "the server was unreachable", and whether a request is in
 * flight. Each form wrote the three around one `await`, so they are one state
 * here — and the transition is the same on signup, sign-in, reset and update.
 */
export interface AuthSubmitState {
  message: string | null;
  offline: boolean;
  pending: boolean;
}

export type AuthSubmitAction =
  /** A request just left: clear the last answer and raise the spinner. */
  | { type: 'submitStarted' }
  /** The request answered: show its sentence and whether it never arrived. */
  | { type: 'submitAnswered'; message: string; offline: boolean }
  /** The request settled, however it answered: lower the spinner. */
  | { type: 'submitSettled' };

export const INITIAL_AUTH_SUBMIT: AuthSubmitState = {
  message: null,
  offline: false,
  pending: false,
};

export function authSubmitReducer(
  state: AuthSubmitState,
  action: AuthSubmitAction
): AuthSubmitState {
  switch (action.type) {
    case 'submitStarted':
      return { message: null, offline: false, pending: true };

    case 'submitAnswered':
      return { ...state, message: action.message, offline: action.offline };

    case 'submitSettled':
      return state.pending ? { ...state, pending: false } : state;
  }
}
