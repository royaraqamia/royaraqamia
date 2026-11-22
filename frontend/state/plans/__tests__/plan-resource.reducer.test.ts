import { describe, expect, it } from 'vitest';
import {
  planResourceInitialState,
  planResourceReducer,
  type PlanResourceState,
} from '@/frontend/state/plans/plan-resource.reducer';

interface Usage {
  used: number;
}

describe('planResourceInitialState', () => {
  it('starts loading when the resource is enabled', () => {
    expect(planResourceInitialState<Usage>(true)).toEqual({
      value: null,
      loading: true,
      failed: false,
    });
  });

  it('starts idle when the resource is disabled', () => {
    expect(planResourceInitialState<Usage>(false)).toEqual({
      value: null,
      loading: false,
      failed: false,
    });
  });
});

describe('loading', () => {
  it('raises the spinner and clears a previous failure', () => {
    const state: PlanResourceState<Usage> = { value: null, loading: false, failed: true };

    expect(planResourceReducer(state, { type: 'loadStarted' })).toEqual({
      value: null,
      loading: true,
      failed: false,
    });
  });

  it('settles the value and the spinner together on success', () => {
    const state = planResourceReducer(planResourceInitialState<Usage>(true), {
      type: 'loadSucceeded',
      value: { used: 3 },
    });

    expect(state).toEqual({ value: { used: 3 }, loading: false, failed: false });
  });

  it('keeps the last value and names the failure', () => {
    const previous: PlanResourceState<Usage> = { value: { used: 3 }, loading: true, failed: false };

    expect(planResourceReducer(previous, { type: 'loadFailed' })).toEqual({
      value: { used: 3 },
      loading: false,
      failed: true,
    });
  });

  it('drops the value when the resource is disabled and leaves the failure alone', () => {
    const previous: PlanResourceState<Usage> = { value: { used: 3 }, loading: true, failed: true };

    expect(planResourceReducer(previous, { type: 'disabled' })).toEqual({
      value: null,
      loading: false,
      failed: true,
    });
  });
});
