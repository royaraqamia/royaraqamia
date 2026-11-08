'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { cn } from '@/frontend/shared/cn';
import { NEWS_ARCHIVE_COPY } from './news-archive-copy';
import { newsHref, type NewsView } from './news-url';
import { formatDigestDayShort, type NewsCategory } from '@/shared/contracts/news';

interface NewsFiltersProps {
  /** The selected day, or null for "latest". */
  date: string | null;
  /** Read from the URL only: the chips that set it are gone, a shared link still carries it. */
  category: NewsCategory | null;
  /** The committed search term, kept across a chip or day change. */
  query: string;
  /** The digest on screen, kept across a chip or day change: filtering is not a view change. */
  view: NewsView;
  /** Every retained day, newest first, for the archive strip. */
  dates: string[];
  /** Search results are site-wide, so the day strip is hidden while searching. */
  isSearching: boolean;
  /**
   * True while the page is showing a snapshot (#555): a chip or a day is a read,
   * and a read with no connection is the state the page has already named.
   */
  disabled?: boolean;
}

/**
 * The page's URL is the filter state.
 *
 * Every control pushes a new `searchParams` value and the server component
 * re-renders, so a filtered view is shareable, back/forward works, and the page
 * needs no client-side copy of the digest. `replace` rather than `push` keeps a
 * long archive walk out of the history stack; the search box (`NewsSearch`) owns
 * the query itself and pushes, because a query is a destination a reader
 * returns to.
 *
 * The categories strip is gone: the digest is read top to bottom, and a row of
 * chips above it read as a second navigation. `?category=` is still honoured, so
 * a shared link from before the strip keeps filtering, and the day strip keeps
 * carrying it across a day change.
 */
export function NewsFilters({
  date,
  category,
  query,
  view,
  dates,
  isSearching,
  disabled = false,
}: NewsFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const navigate = (nextDate: string | null) => {
    if (disabled) return;

    // A search spans every retained day, so it supersedes the selected one.
    const href = newsHref(pathname, {
      q: query,
      category,
      date: query ? null : nextDate,
      view,
    });

    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  };

  return (
    <div
      className={cn('space-y-4', isPending && 'opacity-60', disabled && 'opacity-70')}
      aria-busy={isPending}
      aria-disabled={disabled}
    >
      {!isSearching && dates.length > 0 ? (
        <nav
          aria-label={NEWS_ARCHIVE_COPY.archiveLabel}
          data-visual="news-archive"
          className="scrollbar-none flex gap-2 overflow-x-auto pb-1"
        >
          <button
            type="button"
            aria-pressed={date === null}
            disabled={disabled}
            onClick={() => navigate(null)}
            className={cn(
              'shrink-0 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors',
              date === null
                ? 'border-primary/40 bg-primary/15 text-primary'
                : 'border-border/60 bg-card/70 text-muted-foreground hover:text-foreground'
            )}
          >
            {NEWS_ARCHIVE_COPY.latest}
          </button>
          {dates.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={date === value}
              disabled={disabled}
              onClick={() => navigate(value)}
              className={cn(
                'shrink-0 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors',
                date === value
                  ? 'border-primary/40 bg-primary/15 text-primary'
                  : 'border-border/60 bg-card/70 text-muted-foreground hover:text-foreground'
              )}
            >
              {formatDigestDayShort(value)}
            </button>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
