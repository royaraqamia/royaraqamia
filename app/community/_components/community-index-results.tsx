'use client';

import { useCallback, useEffect, useReducer, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { PostSummary } from '@/shared/contracts/blogpress';
import {
  halveList,
  screenful,
  usePublicSnapshot,
  usePublicSnapshotRecorder,
} from '@/frontend/shared/local-store/snapshot';
import { normaliseSnapshotRoute } from '@/frontend/shared/local-store/snapshot-route';
import { requestWithMeta } from '@/frontend/transport/http';
import { CommunityResults } from './community-results';
import { CommunitySearchSummary } from './community-search-summary';
import {
  communityFeedInitialState,
  communityFeedReducer,
  type CommunitySnapshot,
  type IndexData,
} from './community-index-results.reducer';

interface CommunityIndexResultsProps {
  initialPosts: PostSummary[];
  initialNextCursor: string | null;
  /**
   * Which feed this island is showing: the member's own (`following`) or the
   * public hub's (`index`). The two read different routes - one is per-viewer and
   * `no-store`, the other is one cached document for every visitor - so the
   * island cannot pick one for both without becoming the bug it avoids.
   */
  source?: 'following' | 'index';
  /** Why the list is empty when it is not a search that emptied it. */
  emptyKind?: 'none' | 'no-follows' | 'guest';
}

/**
 * The byte budget's trim: the first screenful, then half of it per pass. A feed
 * page is already bounded by its own page size, so this only bites on posts with
 * long excerpts.
 */
function trimCommunitySnapshot(snapshot: CommunitySnapshot): CommunitySnapshot | null {
  const posts = halveList(screenful(snapshot.posts));
  return posts.length === 0 ? null : { ...snapshot, posts };
}

function fetchIndex(
  path: string,
  cursor: string | null,
  query: string,
  signal?: AbortSignal
): ReturnType<typeof requestWithMeta<IndexData>> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (query) params.set('q', query);
  const search = params.toString();

  // Through the transport so a request that never left is distinguishable from a
  // server that answered with a failure (#475): the two get different states. The
  // metadata says whether the answer may be kept at all — a response the server
  // marked `no-store` is never recorded (#555), which is what keeps the personal
  // feed out of the shared snapshot.
  return requestWithMeta<IndexData>(`${path}${search ? `?${search}` : ''}`, {
    signal,
  });
}

function CommunityFeedSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-3xl border border-border bg-muted/20 overflow-hidden animate-pulse"
        >
          <div className="aspect-16/10 w-full bg-muted/60" />
          <div className="p-6 sm:p-7 space-y-3">
            <div className="h-5 w-3/4 rounded-full bg-muted/70" />
            <div className="h-3.5 w-full rounded-full bg-muted/50" />
            <div className="h-3.5 w-2/3 rounded-full bg-muted/50" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Client island for the `/community` feed.
 *
 * Page 1 is statically prerendered (ISR) and passed in as `initialPosts`; the
 * island keeps the rendered list in state so it can append further pages via the
 * opaque keyset `cursor` when the visitor presses "load more" (which degrades to
 * a `?cursor=` navigation without JS). Searching or opening a direct `?cursor=`
 * link replaces the list instead of appending to it.
 *
 * A read that never reached the server is not an empty feed (ADR-0031), so both
 * the page load and "load more" keep a failure state with a retry rather than
 * leaving the last list in place.
 */
export function CommunityIndexResults({
  initialPosts,
  initialNextCursor,
  source = 'index',
  emptyKind = 'none',
}: CommunityIndexResultsProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const path = source === 'following' ? '/api/community/following' : '/api/community/index';
  const cursor = searchParams.get('cursor');
  const query = searchParams.get('q')?.trim() ?? '';
  const isDefault = !cursor && !query;
  // The snapshot is the public store: a device keeps one copy per route, and the
  // personal feed's rows are one member's follows. Recording them would hand the
  // next member on this device the previous member's feed, so the personal route
  // reads and writes no snapshot at all.
  const route = normaliseSnapshotRoute(pathname, searchParams.toString());

  const [feed, dispatch] = useReducer(
    communityFeedReducer,
    { initialPosts, initialNextCursor, isDefault },
    ({ initialPosts: posts, initialNextCursor: next, isDefault: isDefaultView }) =>
      communityFeedInitialState(posts, next, isDefaultView)
  );
  const { posts, nextCursor, ready, loadingMore, pageError, loadMoreError, recordable } = feed;
  // Only a trigger for the effect below: nothing renders it.
  const [reloadKey, setReloadKey] = useState(0);

  const snapshot = usePublicSnapshot<CommunitySnapshot>(route);

  useEffect(() => {
    if (isDefault) {
      dispatch({
        type: 'restored',
        posts: initialPosts,
        nextCursor: initialNextCursor,
        capturedAt: new Date().toISOString(),
      });
      return;
    }

    const controller = new AbortController();
    dispatch({ type: 'pageLoadStarted' });

    fetchIndex(path, cursor, query, controller.signal)
      .then(({ data, keepable }) => {
        dispatch({
          type: 'pageLoaded',
          data,
          keepable,
          capturedAt: new Date().toISOString(),
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        dispatch({ type: 'pageFailed', error });
      });

    return () => controller.abort();
  }, [path, cursor, query, isDefault, initialPosts, initialNextCursor, reloadKey]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !nextCursor) return;
    const requestCursor = nextCursor;
    dispatch({ type: 'moreStarted' });
    fetchIndex(path, requestCursor, query)
      .then(({ data, keepable }) => {
        dispatch({
          type: 'moreLoaded',
          data,
          keepable,
          capturedAt: new Date().toISOString(),
        });
      })
      .catch((error: unknown) => {
        dispatch({ type: 'moreFailed', error });
      })
      .finally(() => dispatch({ type: 'moreFinished' }));
  }, [path, loadingMore, nextCursor, query]);

  const handleRetryPage = useCallback(() => setReloadKey((key) => key + 1), []);

  // Nothing is recorded for the personal feed: the snapshot store is public and
  // one device can be signed in as more than one member.
  usePublicSnapshotRecorder(route, source === 'following' ? null : recordable, {
    trim: trimCommunitySnapshot,
  });

  if (!ready) return <CommunityFeedSkeleton />;

  // A read that never reached the server keeps the rows this device last showed
  // instead of an empty screen, and says so (#555). Without a snapshot there is
  // nothing to paint, and the failure is the whole answer. Both faces are the
  // results component's: it owns the words, the island owns the fetch.
  if (pageError) {
    return (
      <CommunityResults
        posts={snapshot ? snapshot.posts : []}
        nextCursor={null}
        query={query}
        onLoadMore={handleLoadMore}
        isLoadingMore={loadingMore}
        loadMoreError={loadMoreError}
        onRetryLoadMore={handleLoadMore}
        pageError={snapshot ? null : pageError}
        onRetryPage={handleRetryPage}
        stale={Boolean(snapshot)}
        emptyKind={emptyKind}
      />
    );
  }

  return (
    <>
      {query && <CommunitySearchSummary query={query} />}
      <CommunityResults
        posts={posts}
        nextCursor={nextCursor}
        query={query}
        onLoadMore={handleLoadMore}
        isLoadingMore={loadingMore}
        loadMoreError={loadMoreError}
        onRetryLoadMore={handleLoadMore}
        emptyKind={emptyKind}
      />
    </>
  );
}
