import { describe, expect, it } from 'vitest';
import type { PostSummary } from '@/shared/contracts/blogpress';
import {
  communityFeedInitialState,
  communityFeedReducer,
  type CommunityFeedState,
} from '@/app/community/_components/community-index-results.reducer';

const POST_A = { slug: 'a', title: 'أ' } as unknown as PostSummary;
const POST_B = { slug: 'b', title: 'ب' } as unknown as PostSummary;
const CAPTURED = '2026-11-06T10:00:00.000Z';

function stateOf(patch: Partial<CommunityFeedState> = {}): CommunityFeedState {
  return { ...communityFeedInitialState([], null, true), ...patch };
}

describe('communityFeedInitialState', () => {
  it('is ready at once on the server-rendered page one', () => {
    expect(communityFeedInitialState([POST_A], 'next-1', true)).toMatchObject({
      posts: [POST_A],
      nextCursor: 'next-1',
      ready: true,
      loadingMore: false,
      pageError: null,
      loadMoreError: null,
      recordable: null,
    });
  });

  it('is not ready on a filtered or paginated view, which must be read', () => {
    expect(communityFeedInitialState([], null, false).ready).toBe(false);
  });
});

describe('restoring the server-rendered page', () => {
  it('keeps a snapshot of the rows the document already drew', () => {
    const state = communityFeedReducer(stateOf({ ready: false, pageError: 'x' }), {
      type: 'restored',
      posts: [POST_A],
      nextCursor: 'next-1',
      capturedAt: CAPTURED,
    });

    expect(state).toMatchObject({ posts: [POST_A], nextCursor: 'next-1', ready: true });
    expect(state.pageError).toBeNull();
    expect(state.recordable).toEqual({
      posts: [POST_A],
      nextCursor: 'next-1',
      capturedAt: CAPTURED,
    });
  });

  it('records nothing for an empty page one', () => {
    const state = communityFeedReducer(stateOf(), {
      type: 'restored',
      posts: [],
      nextCursor: null,
      capturedAt: CAPTURED,
    });

    expect(state.recordable).toBeNull();
  });
});

describe('reading a page', () => {
  it('clears both failures and drops ready while the request is out', () => {
    const state = communityFeedReducer(
      stateOf({ pageError: 'a', loadMoreError: 'b', ready: true, loadingMore: true }),
      { type: 'pageLoadStarted' }
    );

    expect(state).toMatchObject({
      ready: false,
      loadingMore: false,
      pageError: null,
      loadMoreError: null,
    });
  });

  it('lands the rows and records them when the answer may be kept', () => {
    const state = communityFeedReducer(stateOf({ ready: false }), {
      type: 'pageLoaded',
      data: { posts: [POST_A], nextCursor: 'next-1' },
      keepable: true,
      capturedAt: CAPTURED,
    });

    expect(state).toMatchObject({ posts: [POST_A], nextCursor: 'next-1', ready: true });
    expect(state.recordable?.posts).toEqual([POST_A]);
  });

  it('records nothing when the server marked the answer no-store', () => {
    const state = communityFeedReducer(stateOf({ ready: false }), {
      type: 'pageLoaded',
      data: { posts: [POST_A], nextCursor: 'next-1' },
      keepable: false,
      capturedAt: CAPTURED,
    });

    expect(state.recordable).toBeNull();
  });

  it('keeps the failure with the rows this device last had (ADR-0031)', () => {
    const state = communityFeedReducer(stateOf({ pageError: null, ready: false }), {
      type: 'pageFailed',
      error: 'offline',
    });

    expect(state).toMatchObject({ pageError: 'offline', ready: true });
  });
});

describe('loading more', () => {
  it('clears the previous failure and raises the flag', () => {
    const state = communityFeedReducer(stateOf({ loadMoreError: 'offline' }), {
      type: 'moreStarted',
    });

    expect(state).toMatchObject({ loadingMore: true, loadMoreError: null });
  });

  it('appends the next page and moves the cursor', () => {
    const state = communityFeedReducer(stateOf({ posts: [POST_A], nextCursor: 'next-1' }), {
      type: 'moreLoaded',
      data: { posts: [POST_B], nextCursor: 'next-2' },
      keepable: true,
      capturedAt: CAPTURED,
    });

    expect(state).toMatchObject({ posts: [POST_A, POST_B], nextCursor: 'next-2' });
    expect(state.recordable).toEqual({
      posts: [POST_A, POST_B],
      nextCursor: 'next-2',
      capturedAt: CAPTURED,
    });
  });

  it('leaves the previous snapshot in place when the page is not keepable', () => {
    const previous = { posts: [POST_A], nextCursor: 'next-1', capturedAt: CAPTURED };
    const state = communityFeedReducer(
      stateOf({ posts: [POST_A], nextCursor: 'next-1', recordable: previous }),
      {
        type: 'moreLoaded',
        data: { posts: [POST_B], nextCursor: 'next-2' },
        keepable: false,
        capturedAt: '2026-11-06T11:00:00.000Z',
      }
    );

    expect(state.posts).toEqual([POST_A, POST_B]);
    expect(state.recordable).toBe(previous);
  });

  it('keeps the appended rows when the next page fails', () => {
    const state = communityFeedReducer(stateOf({ posts: [POST_A], loadingMore: true }), {
      type: 'moreFailed',
      error: 'offline',
    });

    expect(state).toMatchObject({ posts: [POST_A], loadMoreError: 'offline', loadingMore: true });
    expect(communityFeedReducer(state, { type: 'moreFinished' }).loadingMore).toBe(false);
  });
});
