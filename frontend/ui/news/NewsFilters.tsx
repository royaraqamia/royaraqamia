'use client';

import { Search, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { cn } from '@/frontend/shared/cn';
import { NEWS_CATEGORY_ICONS } from './news-format';
import {
  NEWS_CATEGORY_LABELS,
  formatDigestDayShort,
  type NewsCategory,
} from '@/shared/contracts/news';

interface NewsFiltersProps {
  /** The selected day, or null for "latest". */
  date: string | null;
  category: NewsCategory | null;
  query: string;
  /** Every retained day, newest first, for the archive strip. */
  dates: string[];
  /** The categories the selected day actually contains, so no chip filters to nothing. */
  categories: NewsCategory[];
  /** Search results are site-wide, so the day strip is hidden while searching. */
  isSearching: boolean;
}

/**
 * The page's URL is the filter state.
 *
 * Every control pushes a new `searchParams` value and the server component
 * re-renders, so a filtered view is shareable, back/forward works, and the page
 * needs no client-side copy of the digest. `replace` rather than `push` for the
 * day strip keeps a long archive walk out of the history stack; the search box
 * does push, because a query is a destination a reader returns to.
 */
export function NewsFilters({
  date,
  category,
  query,
  dates,
  categories,
  isSearching,
}: NewsFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [term, setTerm] = useState(query);

  // The server is the source of truth (back/forward, a cleared query), so the
  // field follows the URL rather than owning the value.
  useEffect(() => {
    setTerm(query);
  }, [query]);

  const navigate = (next: {
    q?: string | null;
    category?: NewsCategory | null;
    date?: string | null;
    push?: boolean;
  }) => {
    const params = new URLSearchParams();
    const nextQuery = next.q === undefined ? query : next.q;
    const nextCategory = next.category === undefined ? category : next.category;
    const nextDate = next.date === undefined ? date : next.date;

    if (nextQuery) params.set('q', nextQuery);
    if (nextCategory) params.set('category', nextCategory);
    // A search spans every retained day, so it supersedes the selected one.
    if (nextDate && !nextQuery) params.set('date', nextDate);

    const href = params.size > 0 ? `${pathname}?${params.toString()}` : pathname;
    startTransition(() => {
      if (next.push) router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    });
  };

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate({ q: term.trim() || null, date: null, push: true });
  };

  return (
    <div className={cn('space-y-4', isPending && 'opacity-60')} aria-busy={isPending}>
      <form onSubmit={submitSearch} role="search" className="relative">
        <label htmlFor="news-search" className="sr-only">
          ابحث في الأخبار
        </label>
        <Search
          className="pointer-events-none absolute inset-y-0 start-4 my-auto h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          id="news-search"
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="ابحث في أخبار آخر 30 يومًا"
          className="w-full rounded-2xl border border-border/60 bg-card/85 py-3 pe-12 ps-11 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />
        {query ? (
          <button
            type="button"
            onClick={() => navigate({ q: null, date: null })}
            aria-label="مسح البحث"
            className="absolute inset-y-0 end-3 my-auto flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </form>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={category === null}
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
        <nav aria-label="أرشيف الأيام" className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            aria-pressed={date === null}
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
