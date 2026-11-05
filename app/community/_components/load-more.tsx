import Link from 'next/link';
import { Loader2 } from 'lucide-react';

interface LoadMoreProps {
  cursor: string;
  query: string;
  isLoading: boolean;
  onLoadMore: () => void;
  /** The control's words, from the feed's copy source (ADR-0098). */
  label: string;
  loadingLabel: string;
  ariaLabel: string;
}

/**
 * Appends the next page of posts when clicked, in the style of a social feed.
 *
 * It renders a real `?cursor=` link so the control keeps working (and stays
 * crawlable) without JavaScript; with JavaScript the click is intercepted and
 * the next page is appended in place instead of navigating.
 *
 * The words are passed in rather than spelled here: the app draws the same
 * control from the same copy source, so a label that changes on one side is a
 * check failure on the other.
 */
export function LoadMore({
  cursor,
  query,
  isLoading,
  onLoadMore,
  label,
  loadingLabel,
  ariaLabel,
}: LoadMoreProps) {
  const params = new URLSearchParams({ cursor });
  if (query) params.set('q', query);

  return (
    <div className="mt-16 sm:mt-20 flex justify-center" data-visual="community-load-more-region">
      <Link
        href={`/community?${params.toString()}`}
        rel="next"
        data-visual="community-load-more"
        aria-label={ariaLabel}
        aria-busy={isLoading}
        onClick={(event) => {
          event.preventDefault();
          if (!isLoading) onLoadMore();
        }}
        className="group inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-muted/30 px-8 text-sm font-bold text-foreground transition-safe duration-300 hover:border-border hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        {isLoading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {loadingLabel}
          </>
        ) : (
          label
        )}
      </Link>
    </div>
  );
}
