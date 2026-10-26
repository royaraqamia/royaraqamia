'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { PostSummary } from '@/shared/contracts/blogpress';
import {
  halveList,
  screenful,
  usePublicSnapshot,
  usePublicSnapshotRecorder,
} from '@/frontend/shared/local-store/snapshot';
import { normaliseSnapshotRoute } from '@/frontend/shared/local-store/snapshot-route';
import { requestWithMeta } from '@/frontend/transport/http';
import { NeedsConnection } from '@/frontend/ui/shared/needs-connection';
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

/**
 * The feed as this device last painted it (#555).
 *
 * Page one is rendered on the server (ISR) and cached with the document, so an
 * offline reload of `/community` already has its rows. What does not come back
 * offline is a filtered or paginated page: those are reads of a never-cache API,
 * and a query the reader typed yesterday is a destination they return to. This is
 * the copy that answers it, holding the fields the cards render and no more.
 */
interface CommunitySnapshot extends IndexData {
  capturedAt: string;
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

const PAGE_ERROR = 'تعذَّر تحميل المنشورات. أعد المحاولة.';
const LOAD_MORE_ERROR = 'تعذَّر تحميل المزيد من المنشورات. أعد المحاولة.';

function fetchIndex(
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
  // marked `no-store` is never recorded (#555).
  return requestWithMeta<IndexData>(`/api/community/index${search ? `?${search}` : ''}`, {
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
}: CommunityIndexResultsProps) {
  const searchParams = useSearchParams();
  const cursor = searchParams.get('cursor');
  const query = searchParams.get('q')?.trim() ?? '';
  const isDefault = !cursor && !query;
  const route = normaliseSnapshotRoute('/community', searchParams.toString());

  const [posts, setPosts] = useState(initialPosts);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [ready, setReady] = useState(isDefault);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pageError, setPageError] = useState<ReadFailure | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<ReadFailure | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [recordable, setRecordable] = useState<CommunitySnapshot | null>(null);

  const snapshot = usePublicSnapshot<CommunitySnapshot>(route);

  useEffect(() => {
    if (isDefault) {
      setPosts(initialPosts);
      setNextCursor(initialNextCursor);
      setReady(true);
      setIsLoadingMore(false);
      setPageError(null);
      setLoadMoreError(null);
      // The server rendered page one into the document; the rows it drew are
      // what this device can show again without a server.
      setRecordable(
        initialPosts.length === 0
          ? null
          : {
              posts: initialPosts,
              nextCursor: initialNextCursor,
              capturedAt: new Date().toISOString(),
            }
      );
      return;
    }

    const controller = new AbortController();
    setReady(false);
    setIsLoadingMore(false);
    setPageError(null);
    setLoadMoreError(null);

    fetchIndex(cursor, query, controller.signal)
      .then(({ data, keepable }) => {
        setPosts(data.posts);
        setNextCursor(data.nextCursor);
        setReady(true);
        setRecordable(
          keepable && data.posts.length > 0
            ? {
                posts: data.posts,
                nextCursor: data.nextCursor,
                capturedAt: new Date().toISOString(),
              }
            : null
        );
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
      .then(({ data, keepable }) => {
        setPosts((prev) => {
          const next = [...prev, ...data.posts];
          if (keepable) {
            setRecordable({
              posts: next,
              nextCursor: data.nextCursor,
              capturedAt: new Date().toISOString(),
            });
          }
          return next;
        });
        setNextCursor(data.nextCursor);
      })
      .catch((error: unknown) => {
        setLoadMoreError(toReadFailure(error, LOAD_MORE_ERROR));
      })
      .finally(() => setIsLoadingMore(false));
  }, [isLoadingMore, nextCursor, query]);

  const handleRetryPage = useCallback(() => setReloadKey((key) => key + 1), []);

  usePublicSnapshotRecorder(route, recordable, { trim: trimCommunitySnapshot });

  if (!ready) return <CommunityFeedSkeleton />;

  // A read that never reached the server keeps the rows this device last showed
  // instead of an empty screen, and says so (#555). Without a snapshot there is
  // nothing to paint, and the failure is the whole answer.
  if (pageError && snapshot) {
    return (
      <div className="space-y-4">
        <NeedsConnection
          variant="inline"
          message="هذه آخر مشاركات ظهرت لك في هذا القسم. لا يمكن تحديثها أو البحث بلا اتصال."
          onRetry={handleRetryPage}
        />
        <CommunityResults
          posts={snapshot.posts}
          nextCursor={null}
          query={query}
          onLoadMore={handleLoadMore}
          isLoadingMore={isLoadingMore}
          loadMoreError={loadMoreError}
          onRetryLoadMore={handleLoadMore}
        />
      </div>
    );
  }

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
