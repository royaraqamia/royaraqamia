import { describe, expect, it } from 'vitest';

import {
  newsSearchInitialState,
  newsSearchReducer,
  type NewsSearchState,
} from '@/frontend/ui/news/news-search.reducer';
import type { ReadFailure } from '@/frontend/ui/shared/read-failure';
import type { NewsSearchSuggestion } from '@/shared/contracts/news';

const HIT = {
  id: 's-1',
  category: 'politics',
  headline: 'اتفاق جديد في الشرق',
  sourceName: 'مصدر تجريبي',
  digestDate: '2026-10-24',
} as unknown as NewsSearchSuggestion;
const FAILURE = { kind: 'network', message: 'تعذّر' } as unknown as ReadFailure;

function stateOf(patch: Partial<NewsSearchState> = {}): NewsSearchState {
  return { ...newsSearchInitialState(), ...patch };
}

describe('newsSearchInitialState', () => {
  it('starts closed, empty and with no row highlighted', () => {
    expect(newsSearchInitialState()).toEqual({
      hits: [],
      open: false,
      loading: false,
      error: null,
      attempt: 0,
      active: -1,
    });
  });
});

describe('the debounced request', () => {
  it('marks the panel loading and drops the previous failure when the request starts', () => {
    const state = newsSearchReducer(stateOf({ error: FAILURE }), { type: 'requested' });

    expect(state).toMatchObject({ loading: true, error: null });
  });

  it('paints the hits, opens the panel and rewinds the highlight', () => {
    const state = newsSearchReducer(stateOf({ loading: true, active: 2, open: false }), {
      type: 'succeeded',
      hits: [HIT],
    });

    expect(state).toMatchObject({ hits: [HIT], open: true, active: -1, error: null });
  });

  it('names a failed read instead of painting it as no results', () => {
    const state = newsSearchReducer(stateOf({ loading: true, hits: [HIT] }), {
      type: 'failed',
      error: FAILURE,
    });

    expect(state).toMatchObject({ hits: [], error: FAILURE, open: true, active: -1 });
  });

  it('ends the flight', () => {
    expect(newsSearchReducer(stateOf({ loading: true }), { type: 'finished' }).loading).toBe(false);
  });

  it('asks again on retry', () => {
    const state = newsSearchReducer(stateOf({ error: FAILURE }), { type: 'retryRequested' });

    expect(state).toMatchObject({ loading: true, attempt: 1 });
  });
});

describe('the panel', () => {
  it('opens, closes and dismisses without touching the hits', () => {
    const opened = newsSearchReducer(stateOf({ hits: [HIT] }), { type: 'opened' });
    expect(opened.open).toBe(true);

    const closed = newsSearchReducer(opened, { type: 'closed' });
    expect(closed.open).toBe(false);

    const dismissed = newsSearchReducer(stateOf({ open: true, active: 1 }), {
      type: 'dismissed',
    });
    expect(dismissed).toMatchObject({ open: false, active: -1 });
  });
});

describe('the highlighted row', () => {
  it('moves down through the hits and the "view all" row', () => {
    let state = stateOf({ hits: [HIT], open: true });

    state = newsSearchReducer(state, { type: 'activeMoved', delta: 1, rowCount: 2 });
    expect(state.active).toBe(0);

    state = newsSearchReducer(state, { type: 'activeMoved', delta: 1, rowCount: 2 });
    expect(state.active).toBe(1);

    state = newsSearchReducer(state, { type: 'activeMoved', delta: 1, rowCount: 2 });
    expect(state.active).toBe(1);
  });

  it('moves up and stops before the first row', () => {
    let state = stateOf({ active: 1 });

    state = newsSearchReducer(state, { type: 'activeMoved', delta: -1, rowCount: 2 });
    expect(state.active).toBe(0);

    state = newsSearchReducer(state, { type: 'activeMoved', delta: -1, rowCount: 2 });
    expect(state.active).toBe(-1);

    state = newsSearchReducer(state, { type: 'activeMoved', delta: -1, rowCount: 2 });
    expect(state.active).toBe(-1);
  });

  it('jumps to a row on hover', () => {
    expect(newsSearchReducer(stateOf(), { type: 'activeSet', index: 3 }).active).toBe(3);
  });
});

describe('reset', () => {
  it('empties the panel and clears the highlight when the term is gone', () => {
    const state = newsSearchReducer(
      stateOf({ hits: [HIT], open: true, loading: true, error: FAILURE, active: 1 }),
      { type: 'reset' }
    );

    expect(state).toMatchObject({ hits: [], open: false, loading: false, error: null, active: -1 });
  });
});
