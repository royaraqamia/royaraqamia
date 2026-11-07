import { describe, expect, it } from 'vitest';

import {
  bulkPostsInitialState,
  bulkPostsReducer,
  type BulkPostsData,
} from '@/frontend/state/blogpress/use-bulk-posts.reducer';

const IDS = ['p-1', 'p-2', 'p-3'];

function stateOf(patch: Partial<BulkPostsData> = {}): BulkPostsData {
  return { ...bulkPostsInitialState(), ...patch };
}

describe('bulkPostsInitialState', () => {
  it('starts with nothing selected, idle and quiet', () => {
    const state = bulkPostsInitialState();

    expect(state.selected.size).toBe(0);
    expect(state.busy).toBe(false);
    expect(state.error).toBeNull();
  });
});

describe('selecting rows', () => {
  it('adds an id without dropping the ones already picked', () => {
    const first = bulkPostsReducer(stateOf(), { type: 'toggled', id: 'p-1' });
    const second = bulkPostsReducer(first, { type: 'toggled', id: 'p-3' });

    expect([...second.selected]).toEqual(['p-1', 'p-3']);
  });

  it('removes an id that is already picked', () => {
    const state = bulkPostsReducer(stateOf({ selected: new Set(IDS) }), {
      type: 'toggled',
      id: 'p-2',
    });

    expect([...state.selected]).toEqual(['p-1', 'p-3']);
  });

  it('never mutates the set it was given', () => {
    const before = new Set(['p-1']);
    const state = bulkPostsReducer(stateOf({ selected: before }), {
      type: 'toggled',
      id: 'p-2',
    });

    expect([...before]).toEqual(['p-1']);
    expect(state.selected).not.toBe(before);
  });

  it('selects every row when they are not all selected', () => {
    const state = bulkPostsReducer(stateOf({ selected: new Set(['p-1']) }), {
      type: 'allToggled',
      ids: IDS,
    });

    expect([...state.selected]).toEqual(IDS);
  });

  it('clears when every row is already selected', () => {
    const state = bulkPostsReducer(stateOf({ selected: new Set(IDS) }), {
      type: 'allToggled',
      ids: IDS,
    });

    expect(state.selected.size).toBe(0);
  });

  it('does not treat an empty list as fully selected', () => {
    const state = bulkPostsReducer(stateOf(), { type: 'allToggled', ids: [] });

    expect(state.selected.size).toBe(0);
  });

  it('clears the selection on demand', () => {
    const state = bulkPostsReducer(stateOf({ selected: new Set(IDS) }), { type: 'cleared' });

    expect(state.selected.size).toBe(0);
  });
});

describe('running an action', () => {
  it('clears the last failure and raises the flag before the call', () => {
    const state = bulkPostsReducer(stateOf({ error: 'سابق' }), { type: 'runStarted' });

    expect(state.busy).toBe(true);
    expect(state.error).toBeNull();
  });

  it('keeps the refusal and settles the flag', () => {
    const started = bulkPostsReducer(stateOf({ selected: new Set(IDS) }), { type: 'runStarted' });
    const failed = bulkPostsReducer(started, {
      type: 'runFailed',
      message: 'فشل تنفيذ الإجراء',
    });
    const settled = bulkPostsReducer(failed, { type: 'runFinished' });

    expect(settled).toEqual({
      selected: new Set(IDS),
      busy: false,
      error: 'فشل تنفيذ الإجراء',
    });
  });
});
