import { describe, expect, it } from 'vitest';

import {
  formWizardInitialState,
  formWizardReducer,
  type FormWizardState,
} from '@/frontend/ui/shared/form-wizard.reducer';

function stateOf(patch: Partial<FormWizardState> = {}): FormWizardState {
  return { ...formWizardInitialState(3), ...patch };
}

describe('formWizardInitialState', () => {
  it('starts on the first step with nothing refused and nothing queued', () => {
    expect(formWizardInitialState(4)).toEqual({
      stepIndex: 0,
      stepCount: 4,
      submitError: null,
      queued: false,
    });
  });
});

describe('stepping', () => {
  it('advances one step and clears the previous refusal', () => {
    const state = formWizardReducer(stateOf({ submitError: 'تعذّر' }), { type: 'stepAdvanced' });

    expect(state).toMatchObject({ stepIndex: 1, submitError: null });
  });

  it('never advances past the last step', () => {
    const last = stateOf({ stepIndex: 2 });

    expect(formWizardReducer(last, { type: 'stepAdvanced' }).stepIndex).toBe(2);
  });

  it('goes back one step and clears the previous refusal', () => {
    const state = formWizardReducer(stateOf({ stepIndex: 2, submitError: 'تعذّر' }), {
      type: 'stepBacked',
    });

    expect(state).toMatchObject({ stepIndex: 1, submitError: null });
  });

  it('never goes back past the first step', () => {
    expect(formWizardReducer(stateOf(), { type: 'stepBacked' }).stepIndex).toBe(0);
  });
});

describe('submission', () => {
  it('clears the previous refusal when a request starts', () => {
    const state = formWizardReducer(stateOf({ submitError: 'تعذّر' }), {
      type: 'submissionStarted',
    });

    expect(state.submitError).toBeNull();
  });

  it('keeps the same state when there is nothing to clear', () => {
    const state = stateOf();

    expect(formWizardReducer(state, { type: 'submissionStarted' })).toBe(state);
  });

  it('records the reason the request was refused', () => {
    const state = formWizardReducer(stateOf(), {
      type: 'submissionFailed',
      message: 'تعذّر الإرسال.',
    });

    expect(state.submitError).toBe('تعذّر الإرسال.');
  });
});

describe('the queued panel', () => {
  it('marks the request as waiting in the Outbox', () => {
    expect(formWizardReducer(stateOf(), { type: 'queued' }).queued).toBe(true);
  });

  it('leaves a queued state alone when told again', () => {
    const queued = stateOf({ queued: true });

    expect(formWizardReducer(queued, { type: 'queued' })).toBe(queued);
  });

  it('drops the queued panel when the visitor starts over', () => {
    expect(formWizardReducer(stateOf({ queued: true }), { type: 'queueCleared' }).queued).toBe(
      false
    );
  });
});
