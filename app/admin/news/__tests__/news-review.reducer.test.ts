import { describe, expect, it } from 'vitest';

import type { NewsSourceRequest } from '@/shared/contracts/news';
import {
  defaultNewsDraft,
  newsReviewInitialState,
  newsReviewReducer,
  type NewsReviewState,
} from '@/app/admin/news/news-review.reducer';

function request(patch: Partial<NewsSourceRequest> = {}): NewsSourceRequest {
  return {
    id: 'req-1',
    url: 'https://example.com/feed',
    name: 'مثال',
    status: 'ready',
    kind: 'feed',
    resolvedUrl: 'https://example.com/rss',
    failure: null,
    failureDetail: null,
    attempts: 1,
    resolvedAt: '2026-01-01T00:00:00.000Z',
    category: 'tech',
    region: 'world',
    tier: 1,
    note: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    reviewedAt: null,
    sourceId: null,
    userSourceId: null,
    ...patch,
  };
}

function stateOf(patch: Partial<NewsReviewState> = {}): NewsReviewState {
  return { ...newsReviewInitialState('all'), ...patch };
}

describe('newsReviewInitialState', () => {
  it('waits on the first read under the given filter', () => {
    expect(newsReviewInitialState('ready')).toEqual({
      requests: [],
      statusFilter: 'ready',
      loading: true,
      decidingId: null,
      drafts: {},
    });
  });
});

describe('the queue', () => {
  it('changes the filter without touching the rows', () => {
    const rows = [request()];

    expect(
      newsReviewReducer(stateOf({ requests: rows }), {
        type: 'filterChanged',
        filter: 'needs_review',
      })
    ).toMatchObject({ statusFilter: 'needs_review', requests: rows });
  });

  it('lands the rows and finishes the read', () => {
    const rows = [request()];

    expect(newsReviewReducer(stateOf(), { type: 'loaded', requests: rows })).toMatchObject({
      requests: rows,
      loading: false,
    });
  });

  it('finishes the read when it failed, leaving the rows as they were', () => {
    const rows = [request()];

    expect(newsReviewReducer(stateOf({ requests: rows }), { type: 'loadFailed' })).toMatchObject({
      loading: false,
      requests: rows,
    });
  });

  it('replaces the decided row and clears the in-flight id', () => {
    const rows = [request(), request({ id: 'req-2', name: 'ثانٍ' })];
    const updated = request({ id: 'req-1', status: 'approved' });

    const decided = newsReviewReducer(stateOf({ requests: rows, decidingId: 'req-1' }), {
      type: 'decided',
      request: updated,
    });
    const finished = newsReviewReducer(decided, { type: 'decideFinished' });

    expect(decided.requests).toEqual([updated, rows[1]]);
    expect(finished.decidingId).toBeNull();
  });
});

describe('the per-row draft', () => {
  it('offers the resolved facts as the untouched draft', () => {
    expect(defaultNewsDraft(request())).toEqual({
      category: 'tech',
      region: 'world',
      tier: 1,
      note: '',
      feedUrl: '',
      destination: 'private',
    });
  });

  it('falls back to the queue defaults for an unresolved request', () => {
    expect(defaultNewsDraft(request({ category: null, region: null, tier: null }))).toMatchObject({
      category: 'world',
      region: 'world',
      tier: 2,
    });
  });

  it('merges each patch onto the draft it already has', () => {
    const first = newsReviewReducer(stateOf(), {
      type: 'draftPatched',
      request: request(),
      patch: { feedUrl: 'https://example.com/rss' },
    });
    const second = newsReviewReducer(first, {
      type: 'draftPatched',
      request: request(),
      patch: { note: 'موثوق' },
    });

    expect(second.drafts['req-1']).toMatchObject({
      category: 'tech',
      feedUrl: 'https://example.com/rss',
      note: 'موثوق',
    });
  });
});
