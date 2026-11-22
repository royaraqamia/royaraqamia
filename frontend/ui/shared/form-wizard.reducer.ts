/**
 * The state every lead form wizard shares: which step is active, why the last
 * submission was refused, and whether the request is waiting in the Outbox.
 *
 * Next, Back and Start over each moved two or three of these at once, so they
 * are one transition here rather than setters that can drift. The step count
 * travels with the state so the reducer can clamp without reading a constant
 * from the component that built it (a pure reducer, tested without a DOM).
 */
export interface FormWizardState {
  stepIndex: number;
  stepCount: number;
  submitError: string | null;
  queued: boolean;
}

export type FormWizardAction =
  | { type: 'stepAdvanced' }
  | { type: 'stepBacked' }
  | { type: 'submissionStarted' }
  | { type: 'submissionFailed'; message: string }
  | { type: 'queued' }
  | { type: 'queueCleared' };

export function formWizardInitialState(stepCount: number): FormWizardState {
  return { stepIndex: 0, stepCount, submitError: null, queued: false };
}

export function formWizardReducer(
  state: FormWizardState,
  action: FormWizardAction
): FormWizardState {
  switch (action.type) {
    case 'stepAdvanced':
      return {
        ...state,
        submitError: null,
        stepIndex: Math.min(state.stepIndex + 1, state.stepCount - 1),
      };

    case 'stepBacked':
      return {
        ...state,
        submitError: null,
        stepIndex: Math.max(state.stepIndex - 1, 0),
      };

    case 'submissionStarted':
      return state.submitError === null ? state : { ...state, submitError: null };

    case 'submissionFailed':
      return { ...state, submitError: action.message };

    case 'queued':
      return state.queued ? state : { ...state, queued: true };

    case 'queueCleared':
      return state.queued ? { ...state, queued: false } : state;
  }
}
