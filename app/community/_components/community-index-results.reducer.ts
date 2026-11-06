import type { PostSummary } from '@/shared/contracts/blogpress';

export interface IndexData {
  posts: PostSummary[];
  nextCursor: string | null;
}

/**
 * The feed as this device last painted it (#555). Page one is rendered on the
 * server and cached with the document; a filtered or paginated page is a read of
 * a never-cache API, so this is the copy that answers one offline.
 */
export interface CommunitySnapshot extends IndexData {
  capturedAt: string;
}

/**
 * One feed view: the rows it is showing, the cursor that would extend them, and
 * the three things that can be wrong with the request that produced them — the
 * page itself, the "load more" that followed, or neither.
 *
 * The page effect used to write six of these in a burst, and "load more" wrote
 * `posts`, `nextCursor` and the snapshot from inside a state updater. Both are
 * single transitions now.
 */
export interface CommunityFeedState {
  posts: PostSummary[];
  nextCursor: string | null;
  /** False while page one of a filtered or paginated view is still in flight. */
  ready: boolean;
  loadingMore: boolean;
  pageError: unknown | null;
  loadMoreError: unknown | null;
  /** What the local snapshot recorder should keep, if anything. */
  recordable: CommunitySnapshot | null;
}

export type CommunityFeedAction =
  | { type: 'restored'; posts: PostSummary[]; nextCursor: string | null; capturedAt: string }
  | { type: 'pageLoadStarted' }
  | { type: 'pageLoaded'; data: IndexData; keepable: boolean; capturedAt: string }
  | { type: 'pageFailed'; error: unknown }
  | { type: 'moreStarted' }
  | { type: 'moreLoaded'; data: IndexData; keepable: boolean; capturedAt: string }
  | { type: 'moreFailed'; error: unknown }
  | { type: 'moreFinished' };

export function communityFeedInitialState(
  initialPosts: PostSummary[],
  initialNextCursor: string | null,
  isDefault: boolean
): CommunityFeedState {
  return {
    posts: initialPosts,
    nextCursor: initialNextCursor,
    ready: isDefault,
    loadingMore: false,
    pageError: null,
    loadMoreError: null,
    recordable: null,
  };
}

function snapshotOf(data: IndexData, capturedAt: string): CommunitySnapshot {
  return { posts: data.posts, nextCursor: data.nextCursor, capturedAt };
}

export function communityFeedReducer(
  state: CommunityFeedState,
  action: CommunityFeedAction
): CommunityFeedState {
  switch (action.type) {
    case 'restored': {
      // The server rendered page one into the document; the rows it drew are what
      // this device can show again without a server.
      const data = { posts: action.posts, nextCursor: action.nextCursor };
      return {
        ...state,
        ...data,
        ready: true,
        loadingMore: false,
        pageError: null,
        loadMoreError: null,
        recordable: action.posts.length === 0 ? null : snapshotOf(data, action.capturedAt),
      };
    }

    case 'pageLoadStarted':
      return {
        ...state,
        ready: false,
        loadingMore: false,
        pageError: null,
        loadMoreError: null,
      };

    case 'pageLoaded':
      return {
        ...state,
        posts: action.data.posts,
        nextCursor: action.data.nextCursor,
        ready: true,
        recordable:
          action.keepable && action.data.posts.length > 0
            ? snapshotOf(action.data, action.capturedAt)
            : null,
      };

    case 'pageFailed':
      // A read that never reached the server is not an empty feed (ADR-0031).
      return { ...state, pageError: action.error, ready: true };

    case 'moreStarted':
      return { ...state, loadingMore: true, loadMoreError: null };

    case 'moreLoaded': {
      const posts = [...state.posts, ...action.data.posts];
      return {
        ...state,
        posts,
        nextCursor: action.data.nextCursor,
        // Only a keepable answer replaces the record; a `no-store` one leaves the
        // previous snapshot in place.
        recordable: action.keepable
          ? snapshotOf({ posts, nextCursor: action.data.nextCursor }, action.capturedAt)
          : state.recordable,
      };
    }

    case 'moreFailed':
      return { ...state, loadMoreError: action.error };

    case 'moreFinished':
      return state.loadingMore ? { ...state, loadingMore: false } : state;
  }
}
