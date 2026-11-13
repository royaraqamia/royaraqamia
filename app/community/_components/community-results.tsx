import Link from 'next/link';
import { FileText } from 'lucide-react';
import { Button } from '@/frontend/ui/primitives/button';
import { NeedsConnection } from '@/frontend/ui/shared/needs-connection';
import { ReadFailureNotice, toReadFailure } from '@/frontend/ui/shared/read-failure';
import { COMMUNITY_FEED_COPY } from './community-feed-copy';
import type { PostSummary } from '@/shared/contracts/blogpress';
import { PostCard } from './post-card';
import { LoadMore } from './load-more';

interface CommunityResultsProps {
  posts: PostSummary[];
  nextCursor: string | null;
  query: string;
  onLoadMore: () => void;
  isLoadingMore: boolean;
  /** The next-page read's error, shown instead of a button that would do nothing. */
  loadMoreError?: unknown;
  onRetryLoadMore?: () => void;
  /**
   * The read that filled the list failed. The cause decides the face — an
   * unreachable server is `NeedsConnection`, a refusal is "the request did not
   * complete" (ADR-0031) — and the words for both are the feed's own.
   */
  pageError?: unknown;
  onRetryPage?: () => void;
  /**
   * The rows are the snapshot this device kept: shown with the banner that says
   * so, never passed off as a fresh read (#555).
   */
  stale?: boolean;
  /**
   * Why there are no rows, when it is not the search that emptied the list.
   *
   * `no-follows` is the personal feed's normal first day, and `guest` is the
   * same page before signing in. Both are a different sentence from "nothing
   * was ever published" — the visitor needs to know what to do next, and only
   * one of the three has nothing to do.
   */
  emptyKind?: 'none' | 'no-follows' | 'guest';
}

/**
 * What the feed draws, once the island has decided what there is to draw.
 *
 * It is the app's reference for the surface (#658): the island above fetches and
 * pages, this component owns the empty state, the snapshot banner and the two
 * failure faces, so the words the app shows are the words in this file's copy
 * source rather than a string it typed.
 */
export function CommunityResults({
  posts,
  nextCursor,
  query,
  onLoadMore,
  isLoadingMore,
  loadMoreError,
  onRetryLoadMore,
  pageError,
  onRetryPage,
  stale = false,
  emptyKind = 'none',
}: CommunityResultsProps) {
  const pageFailure =
    pageError == null ? null : toReadFailure(pageError, COMMUNITY_FEED_COPY.pageError);
  const loadFailure =
    loadMoreError == null ? null : toReadFailure(loadMoreError, COMMUNITY_FEED_COPY.loadMoreError);

  // A failed read with nothing kept is the whole answer; with a snapshot it is a
  // banner over the rows this device last showed.
  if (pageFailure && !stale) {
    return (
      <ReadFailureNotice
        failure={pageFailure}
        onRetry={onRetryPage}
        className="my-8 rounded-3xl border border-border bg-muted/20"
      />
    );
  }

  return (
    <>
      {stale && (
        <div className="mb-4">
          <NeedsConnection
            variant="inline"
            message={COMMUNITY_FEED_COPY.staleMessage}
            onRetry={onRetryPage}
          />
        </div>
      )}

      {posts.length === 0 ? (
        <div className="relative mx-auto my-8 flex w-full max-w-xl flex-col items-center justify-center overflow-hidden rounded-3xl border border-border bg-muted/20 px-6 py-24 text-center shadow-2xl">
          <div className="size-16 rounded-2xl bg-muted/50 border border-border flex items-center justify-center mb-6 shadow-inner text-muted-foreground">
            <FileText className="size-8 stroke-[1.5]" />
          </div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight mb-2">
            {query
              ? 'لا توجد نتائج للبحث'
              : emptyKind === 'guest'
                ? COMMUNITY_FEED_COPY.guestEmptyTitle
                : emptyKind === 'no-follows'
                  ? COMMUNITY_FEED_COPY.followingEmptyTitle
                  : COMMUNITY_FEED_COPY.emptyTitle}
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-md mb-8 leading-relaxed">
            {query
              ? 'لم نعثر على منشورات تُطابق بحثك. جرِّب كلمات بحث مختلفة.'
              : emptyKind === 'guest'
                ? COMMUNITY_FEED_COPY.guestEmptyBody
                : emptyKind === 'no-follows'
                  ? COMMUNITY_FEED_COPY.followingEmptyBody
                  : COMMUNITY_FEED_COPY.emptyBody}
          </p>
          {emptyKind === 'guest' ? (
            <Link href="/auth/login?redirect=%2Fcommunity">
              <Button className="rounded-full px-6">{COMMUNITY_FEED_COPY.guestSignIn}</Button>
            </Link>
          ) : (
            query && (
              <Link href="/community/explore">
                <Button
                  variant="outline"
                  className="rounded-full bg-muted/50 border-border text-foreground hover:bg-muted/70 hover:border-border transition-safe duration-300 px-6"
                >
                  عرض جميع المنشورات
                </Button>
              </Link>
            )
          )}
        </div>
      ) : (
        <>
          <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
            {posts.map((post, index) => (
              <PostCard key={post.id} post={post} index={index} />
            ))}
          </div>

          {nextCursor &&
            (loadFailure ? (
              <ReadFailureNotice
                failure={loadFailure}
                onRetry={onRetryLoadMore}
                variant="inline"
                className="my-8"
              />
            ) : (
              <LoadMore
                cursor={nextCursor}
                query={query}
                isLoading={isLoadingMore}
                onLoadMore={onLoadMore}
                label={COMMUNITY_FEED_COPY.loadMore}
                loadingLabel={COMMUNITY_FEED_COPY.loading}
                ariaLabel={COMMUNITY_FEED_COPY.loadMoreAria}
              />
            ))}
        </>
      )}
    </>
  );
}
