'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { PostSummary } from '@/shared/contracts/blogpress';
import { request } from '@/frontend/transport/http';
import {
  ReadFailureNotice,
  toReadFailure,
  type ReadFailure,
} from '@/frontend/ui/shared/read-failure';
import { CommunityResults } from './community-results';

interface CommunityIndexResultsProps {
  initialPosts: PostSummary[];
  initialNextCursor: string | null;
}

interface IndexData {
  posts: PostSummary[];
  nextCursor: string | null;
}

const PAGE_ERROR = 'تعذَّر تحميل المنشورات. أعد المحاولة.';
const LOAD_MORE_ERROR = 'تعذَّر تحميل المزيد من المنشورات. أعد المحاولة.';

function fetchIndex(
  cursor: string | null,
  query: string,
  signal?: AbortSignal
): Promise<IndexData> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (query) params.set('q', query);
  const search = params.toString();

  // Through the transport so a request that never left is distinguishable from a
  // server that answered with a failure (#475): the two get different states.
  return request<IndexData>(`/api/community/index${search ? `?${search}` : ''}`, { signal });
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
}: CommunityIndexResultsProps) {
  const searchParams = useSearchParams();
  const cursor = searchParams.get('cursor');
  const query = searchParams.get('q')?.trim() ?? '';
  const isDefault = !cursor && !query;

  const [posts, setPosts] = useState(initialPosts);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [ready, setReady] = useState(isDefault);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pageError, setPageError] = useState<ReadFailure | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<ReadFailure | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (isDefault) {
      setPosts(initialPosts);
      setNextCursor(initialNextCursor);
      setReady(true);
      setIsLoadingMore(false);
      setPageError(null);
      setLoadMoreError(null);
      return;
    }

    const controller = new AbortController();
    setReady(false);
    setIsLoadingMore(false);
    setPageError(null);
    setLoadMoreError(null);

    fetchIndex(cursor, query, controller.signal)
      .then((json) => {
        setPosts(json.posts);
        setNextCursor(json.nextCursor);
        setReady(true);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setPageError(toReadFailure(error, PAGE_ERROR));
        setReady(true);
      });

    return () => controller.abort();
  }, [cursor, query, isDefault, initialPosts, initialNextCursor, reloadKey]);

  const handleLoadMore = useCallback(() => {
    if (isLoadingMore || !nextCursor) return;
    const requestCursor = nextCursor;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    fetchIndex(requestCursor, query)
      .then((json) => {
        setPosts((prev) => [...prev, ...json.posts]);
        setNextCursor(json.nextCursor);
      })
      .catch((error: unknown) => {
        setLoadMoreError(toReadFailure(error, LOAD_MORE_ERROR));
      })
      .finally(() => setIsLoadingMore(false));
  }, [isLoadingMore, nextCursor, query]);

  const handleRetryPage = useCallback(() => setReloadKey((key) => key + 1), []);

  if (!ready) return <CommunityFeedSkeleton />;

  if (pageError) {
    return (
      <ReadFailureNotice
        failure={pageError}
        onRetry={handleRetryPage}
        className="my-8 rounded-3xl border border-border bg-muted/20"
      />
    );
  }

  return (
    <CommunityResults
      posts={posts}
      nextCursor={nextCursor}
      query={query}
      onLoadMore={handleLoadMore}
      isLoadingMore={isLoadingMore}
      loadMoreError={loadMoreError}
      onRetryLoadMore={handleLoadMore}
    />
  );
}
