import { describe, expect, it } from 'vitest';
import type { NewsOwnedSource, NewsOwnedSourcesSummary } from '@/shared/contracts/news';
import {
  newsPrivateSourcesInitialState,
  newsPrivateSourcesReducer,
} from '@/frontend/ui/account/news-private-sources.reducer';

const ROW: NewsOwnedSource = {
  id: 'source-1',
  kind: 'source',
  name: 'مصدر',
  url: 'https://example.com/feed',
  resolvedUrl: null,
  state: 'live',
  failure: null,
  note: null,
  lastError: null,
  createdAt: '2026-10-01T10:00:00.000Z',
};

const SUMMARY: NewsOwnedSourcesSummary = {
  rows: [ROW],
  limited: true,
  cap: 5,
  used: 1,
};

describe('newsPrivateSourcesReducer', () => {
  it('starts loading with no summary', () => {
    expect(newsPrivateSourcesInitialState()).toEqual({
      summary: null,
      loading: true,
      loadError: null,
      removing: null,
      busyId: null,
    });
  });

  it('settles the summary and clears a previous failure', () => {
    const failed = newsPrivateSourcesReducer(newsPrivateSourcesInitialState(), {
      type: 'readFailed',
      error: 'قديم',
    });
    const state = newsPrivateSourcesReducer(failed, {
      type: 'readSucceeded',
      summary: SUMMARY,
    });

    expect(state.summary).toEqual(SUMMARY);
    expect(state.loadError).toBeNull();
  });

  it('stops loading when the read settles', () => {
    const state = newsPrivateSourcesReducer(newsPrivateSourcesInitialState(), {
      type: 'loadSettled',
    });

    expect(state.loading).toBe(false);
  });

  it('names a failed read without dropping the last summary', () => {
    const loaded = newsPrivateSourcesReducer(newsPrivateSourcesInitialState(), {
      type: 'readSucceeded',
      summary: SUMMARY,
    });
    const state = newsPrivateSourcesReducer(loaded, {
      type: 'readFailed',
      error: 'تعذّر التحديث',
    });

    expect(state.summary).toEqual(SUMMARY);
    expect(state.loadError).toBe('تعذّر التحديث');
  });

  it('opens the confirmation for a row and closes it again', () => {
    const opened = newsPrivateSourcesReducer(newsPrivateSourcesInitialState(), {
      type: 'removeRequested',
      row: ROW,
    });
    expect(opened.removing).toBe(ROW);

    expect(newsPrivateSourcesReducer(opened, { type: 'removeClosed' }).removing).toBeNull();
  });

  it('waits on one row and settles the wait whatever the answer', () => {
    const started = newsPrivateSourcesReducer(newsPrivateSourcesInitialState(), {
      type: 'removeStarted',
      id: ROW.id,
    });
    expect(started.busyId).toBe(ROW.id);

    expect(newsPrivateSourcesReducer(started, { type: 'removeSettled' }).busyId).toBeNull();
  });

  it('leaves the busy id alone when it settles a second time', () => {
    const idle = newsPrivateSourcesInitialState();
    expect(newsPrivateSourcesReducer(idle, { type: 'removeSettled' })).toBe(idle);
  });
});
