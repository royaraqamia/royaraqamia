import { describe, expect, it } from 'vitest';

import type { AdminStats } from '@/frontend/api/linksnap';
import {
  adminLinksInitialState,
  adminLinksReducer,
  type AdminLinksState,
} from '@/frontend/state/linksnap/use-admin.reducer';

function adminLink(patch: Partial<AdminStats['links'][number]> = {}) {
  return {
    code: 'abc',
    originalUrl: 'https://example.com',
    userId: 'u-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    isBlocked: false,
    clickCount: 4,
    ...patch,
  };
}

function stats(patch: Partial<AdminStats> = {}): AdminStats {
  return {
    totalLinks: 3,
    totalClicks: 12,
    blockedLinksCount: 1,
    links: [adminLink()],
    ...patch,
  };
}

function stateOf(patch: Partial<AdminLinksState> = {}): AdminLinksState {
  return { ...adminLinksInitialState(), ...patch };
}

describe('adminLinksInitialState', () => {
  it('waits on the first read with nothing painted', () => {
    expect(adminLinksInitialState()).toEqual({
      stats: null,
      loading: true,
      error: null,
      actionLoadingCode: null,
      moderateError: null,
    });
  });
});

describe('the read', () => {
  it('clears the previous failure when a read starts', () => {
    expect(
      adminLinksReducer(stateOf({ error: 'فشل', loading: false }), { type: 'loadStarted' })
    ).toMatchObject({ loading: true, error: null });
  });

  it('paints the stats and finishes the read', () => {
    const payload = stats();

    expect(adminLinksReducer(stateOf(), { type: 'loaded', stats: payload })).toMatchObject({
      stats: payload,
      loading: false,
    });
  });

  it('keeps the sentence and finishes the read when it failed', () => {
    expect(
      adminLinksReducer(stateOf(), { type: 'loadFailed', message: 'فشل في الجلب.' })
    ).toMatchObject({ loading: false, error: 'فشل في الجلب.' });
  });
});

describe('moderating one row', () => {
  it('marks the row in flight and clears the previous sentence', () => {
    expect(
      adminLinksReducer(stateOf({ moderateError: 'قديم' }), {
        type: 'moderationStarted',
        code: 'abc',
      })
    ).toMatchObject({ actionLoadingCode: 'abc', moderateError: null });
  });

  it('flips the row, moves the count and clears the flag in one transition', () => {
    const state = adminLinksReducer(stateOf({ stats: stats(), actionLoadingCode: 'abc' }), {
      type: 'moderationSucceeded',
      code: 'abc',
      blocked: true,
    });

    expect(state.actionLoadingCode).toBeNull();
    expect(state.stats?.blockedLinksCount).toBe(2);
    expect(state.stats?.links?.[0]).toMatchObject({ code: 'abc', isBlocked: true });
  });

  it('decrements when a block is lifted', () => {
    const state = adminLinksReducer(
      stateOf({
        stats: stats({
          blockedLinksCount: 2,
          links: [adminLink({ isBlocked: true })],
        }),
      }),
      { type: 'moderationSucceeded', code: 'abc', blocked: false }
    );

    expect(state.stats?.blockedLinksCount).toBe(1);
    expect(state.stats?.links?.[0]).toMatchObject({ isBlocked: false });
  });

  it('clears the flag even when no stats were painted', () => {
    const state = adminLinksReducer(stateOf({ actionLoadingCode: 'abc' }), {
      type: 'moderationSucceeded',
      code: 'abc',
      blocked: true,
    });

    expect(state).toMatchObject({ actionLoadingCode: null, stats: null });
  });

  it('writes the failure sentence and clears the flag', () => {
    expect(
      adminLinksReducer(stateOf({ actionLoadingCode: 'abc' }), {
        type: 'moderationFailed',
        message: 'تعذّر الحظر.',
      })
    ).toMatchObject({ actionLoadingCode: null, moderateError: 'تعذّر الحظر.' });
  });

  it('lets the panel dismiss the sentence itself', () => {
    const state = adminLinksReducer(stateOf({ moderateError: 'قديم' }), {
      type: 'moderateErrorSet',
      message: null,
    });

    expect(state.moderateError).toBeNull();
  });
});
