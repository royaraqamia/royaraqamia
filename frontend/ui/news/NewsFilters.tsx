'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { cn } from '@/frontend/shared/cn';
import { NEWS_CATEGORY_ICONS } from './news-format';
import { newsHref, type NewsView } from './news-url';
import {
  NEWS_CATEGORY_LABELS,
  formatDigestDayShort,
  type NewsCategory,
} from '@/shared/contracts/news';

interface NewsFiltersProps {
  /** The selected day, or null for "latest". */
  date: string | null;
  category: NewsCategory | null;
  /** The committed search term, kept across a chip or day change. */
  query: string;
  /** The digest on screen, kept across a chip or day change: filtering is not a view change. */
  view: NewsView;
  /** Every retained day, newest first, for the archive strip. */
  dates: string[];
  /** The categories the selected day actually contains, so no chip filters to nothing. */
  categories: NewsCategory[];
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
 */
export function NewsFilters({
  date,
  category,
  query,
  view,
  dates,
  categories,
  isSearching,
  disabled = false,
}: NewsFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const navigate = (next: { category?: NewsCategory | null; date?: string | null }) => {
    if (disabled) return;
    const nextCategory = next.category === undefined ? category : next.category;
    const nextDate = next.date === undefined ? date : next.date;

    // A search spans every retained day, so it supersedes the selected one.
    const href = newsHref(pathname, {
      q: query,
      category: nextCategory,
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
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={category === null}
          disabled={disabled}
          onClick={() => navigate({ category: null })}
          className={cn(
            'rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
            category === null
              ? 'border-primary/40 bg-primary/15 text-primary'
              : 'border-border/60 bg-card/70 text-muted-foreground hover:text-foreground'
          )}
        >
          كل الأقسام
        </button>
        {categories.map((value) => {
          const Icon = NEWS_CATEGORY_ICONS[value];
          const selected = category === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => navigate({ category: selected ? null : value })}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
                selected
                  ? 'border-primary/40 bg-primary/15 text-primary'
                  : 'border-border/60 bg-card/70 text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {NEWS_CATEGORY_LABELS[value]}
            </button>
          );
        })}
      </div>

      {!isSearching && dates.length > 0 ? (
        <nav aria-label="أرشيف الأيام" className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            aria-pressed={date === null}
            disabled={disabled}
            onClick={() => navigate({ date: null })}
            className={cn(
              'shrink-0 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors',
              date === null
                ? 'border-primary/40 bg-primary/15 text-primary'
                : 'border-border/60 bg-card/70 text-muted-foreground hover:text-foreground'
            )}
          >
            الأحدث
          </button>
          {dates.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={date === value}
              disabled={disabled}
              onClick={() => navigate({ date: value })}
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
