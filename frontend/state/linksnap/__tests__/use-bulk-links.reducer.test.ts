import { describe, expect, it } from 'vitest';

import {
  bulkLinksInitialState,
  bulkLinksReducer,
  type BulkLinksState,
} from '@/frontend/state/linksnap/use-bulk-links.reducer';

function stateOf(patch: Partial<BulkLinksState> = {}): BulkLinksState {
  return { ...bulkLinksInitialState(), ...patch };
}

describe('bulkLinksInitialState', () => {
  it('starts with nothing ticked and nothing running', () => {
    expect(bulkLinksInitialState()).toEqual({ selected: new Set(), busy: false, error: null });
  });
});

describe('the selection', () => {
  it('ticks a code and unticks it on the next press', () => {
    const on = bulkLinksReducer(stateOf(), { type: 'toggled', code: 'abc' });
    const off = bulkLinksReducer(on, { type: 'toggled', code: 'abc' });

    expect([...on.selected]).toEqual(['abc']);
    expect([...off.selected]).toEqual([]);
  });

  it('never mutates the previous set', () => {
    const before = stateOf();
    const after = bulkLinksReducer(before, { type: 'toggled', code: 'abc' });

    expect([...before.selected]).toEqual([]);
    expect(after.selected).not.toBe(before.selected);
  });

  it('ticks every code once and clears them on the next press', () => {
    const all = bulkLinksReducer(stateOf(), { type: 'allToggled', codes: ['a', 'b'] });
    const none = bulkLinksReducer(stateOf({ selected: new Set(['a', 'b']) }), {
      type: 'allToggled',
      codes: ['a', 'b'],
    });

    expect([...all.selected]).toEqual(['a', 'b']);
    expect([...none.selected]).toEqual([]);
  });

  it('clears the selection explicitly', () => {
    expect([
      ...bulkLinksReducer(stateOf({ selected: new Set(['a']) }), { type: 'cleared' }).selected,
    ]).toEqual([]);
  });
});

describe('running an action', () => {
  it('raises the busy flag and clears the previous sentence', () => {
    expect(bulkLinksReducer(stateOf({ error: 'قديم' }), { type: 'runStarted' })).toMatchObject({
      busy: true,
      error: null,
    });
  });

  it('writes the failure sentence and finishes the run', () => {
    const failed = bulkLinksReducer(stateOf({ busy: true }), {
      type: 'runFailed',
      message: 'فشل الحذف.',
    });
    const finished = bulkLinksReducer(failed, { type: 'runFinished' });

    expect(failed.error).toBe('فشل الحذف.');
    expect(finished.busy).toBe(false);
  });

  it('does not churn when finishing an idle state', () => {
    const state = stateOf();

    expect(bulkLinksReducer(state, { type: 'runFinished' })).toBe(state);
  });
});
