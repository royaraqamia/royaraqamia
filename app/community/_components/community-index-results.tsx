'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { PostSummary } from '@/shared/contracts/blogpress';
import { CommunityResults } from './community-results';

interface CommunityIndexResultsProps {
  initialPosts: PostSummary[];
  initialNextCursor: string | null;
}

interface IndexData {
  posts: PostSummary[];
  nextCursor: string | null;
}

function fetchIndex(
  cursor: string | null,
  query: string,
  signal?: AbortSignal
): Promise<IndexData> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (query) params.set('q', query);
  const search = params.toString();

  return fetch(`/api/community/index${search ? `?${search}` : ''}`, { signal }).then((res) => {
    if (!res.ok) throw new Error('failed to load community index');
    return res.json() as Promise<IndexData>;
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

  useEffect(() => {
    if (isDefault) {
      setPosts(initialPosts);
      setNextCursor(initialNextCursor);
      setReady(true);
      setIsLoadingMore(false);
      return;
    }

    const controller = new AbortController();
    setReady(false);
    setIsLoadingMore(false);

    fetchIndex(cursor, query, controller.signal)
      .then((json) => {
        setPosts(json.posts);
        setNextCursor(json.nextCursor);
        setReady(true);
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name !== 'AbortError') setReady(true);
      });

    return () => controller.abort();
  }, [cursor, query, isDefault, initialPosts, initialNextCursor]);

  const handleLoadMore = useCallback(() => {
    if (isLoadingMore || !nextCursor) return;
    const requestCursor = nextCursor;
    setIsLoadingMore(true);
    fetchIndex(requestCursor, query)
      .then((json) => {
        setPosts((prev) => [...prev, ...json.posts]);
        setNextCursor(json.nextCursor);
      })
      .catch(() => {})
      .finally(() => setIsLoadingMore(false));
  }, [isLoadingMore, nextCursor, query]);

  if (!ready) return <CommunityFeedSkeleton />;

  return (
    <CommunityResults
      posts={posts}
      nextCursor={nextCursor}
      query={query}
      onLoadMore={handleLoadMore}
      isLoadingMore={isLoadingMore}
    />
  );
}
