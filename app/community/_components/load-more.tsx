'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';

interface LoadMoreProps {
  cursor: string;
  query: string;
  isLoading: boolean;
  onLoadMore: () => void;
}

/**
 * Appends the next page of posts when clicked, in the style of a social feed.
 *
 * It renders a real `?cursor=` link so the control keeps working (and stays
 * crawlable) without JavaScript; with JavaScript the click is intercepted and
 * the next page is appended in place instead of navigating.
 */
export function LoadMore({ cursor, query, isLoading, onLoadMore }: LoadMoreProps) {
  const params = new URLSearchParams({ cursor });
  if (query) params.set('q', query);

  return (
    <div className="mt-16 sm:mt-20 flex justify-center">
      <Link
        href={`/community?${params.toString()}`}
        rel="next"
        aria-label="تحميل المزيد من المنشورات"
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
            جاري التحميل...
          </>
        ) : (
          'تحميل المزيد'
        )}
      </Link>
    </div>
  );
}
