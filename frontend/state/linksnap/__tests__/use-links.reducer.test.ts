import { describe, expect, it } from 'vitest';

import type { ShortenedLink } from '@/frontend/api/linksnap';
import {
  linksListInitialState,
  linksListReducer,
  type LinksListState,
} from '@/frontend/state/linksnap/use-links.reducer';

function link(patch: Partial<ShortenedLink>): ShortenedLink {
  return {
    code: 'abc',
    originalUrl: 'https://example.com',
    createdAt: '2026-01-01T00:00:00.000Z',
    isBlocked: false,
    expiresAt: null,
    status: 'active',
    ...patch,
  };
}

function stateOf(patch: Partial<LinksListState> = {}): LinksListState {
  return { ...linksListInitialState(), ...patch };
}

describe('linksListInitialState', () => {
  it('waits on the first read with no rows', () => {
    expect(linksListInitialState()).toEqual({ links: [], loading: true, error: null });
  });
});

describe('reading', () => {
  it('clears the previous sentence and raises the flag when a read starts', () => {
    const state = linksListReducer(stateOf({ error: 'انقطع', loading: false }), {
      type: 'loadStarted',
    });

    expect(state).toMatchObject({ loading: true, error: null });
  });

  it('lands the rows and finishes the read in one transition', () => {
    const rows = [link({ code: 'one' }), link({ code: 'two' })];

    expect(linksListReducer(stateOf(), { type: 'loaded', links: rows })).toEqual({
      links: rows,
      loading: false,
      error: null,
    });
  });

  it('keeps the sentence and finishes the read when it failed', () => {
    expect(
      linksListReducer(stateOf(), { type: 'loadFailed', message: 'فشل في التحميل.' })
    ).toMatchObject({ loading: false, error: 'فشل في التحميل.' });
  });
});

describe('editing the painted rows', () => {
  it('removes a row by its clientId and keeps the rest', () => {
    const state = stateOf({
      links: [link({ clientId: 'c1', code: 'one' }), link({ clientId: 'c2', code: 'two' })],
    });

    expect(linksListReducer(state, { type: 'linkRemoved', key: 'c1' }).links).toEqual([
      link({ clientId: 'c2', code: 'two' }),
    ]);
  });

  it('merges an update into the row it addresses', () => {
    const state = stateOf({ links: [link({ clientId: 'c1', code: 'one' })] });

    const next = linksListReducer(state, {
      type: 'linkUpdated',
      key: 'c1',
      link: link({ code: 'renamed' }),
    });

    expect(next.links[0]).toMatchObject({ clientId: 'c1', code: 'renamed' });
  });
});
