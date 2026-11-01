'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpLeft, Loader2, Newspaper, Search, X } from 'lucide-react';

import {
  ReadFailureNotice,
  toReadFailure,
  type ReadFailure,
} from '@/frontend/ui/shared/read-failure';
import { newsHref, type NewsView } from '@/frontend/ui/news/news-url';
import { request } from '@/frontend/transport/http';
import {
  NEWS_CATEGORY_LABELS,
  formatDigestDayShort,
  sanitizeNewsQuery,
  type NewsCategory,
  type NewsSearchSuggestion,
  type NewsSearchSuggestions,
} from '@/shared/contracts/news';

const SEARCH_ERROR = 'تعذَّر تحميل نتائج البحث. أعد المحاولة.';

interface NewsSearchProps {
  /** The committed query, which the URL owns. */
  query: string;
  /** The active category chip, kept when a search is committed. */
  category: NewsCategory | null;
  /** The digest on screen, kept when a search is committed: a search is not a view change. */
  view: NewsView;
  /**
   * True while the page is showing a snapshot (#555): the field stays in the
   * page so the reader sees which query the rows answered, but committing one
   * is a read and the page has already named the connection.
   */
  disabled?: boolean;
}

/**
 * The `/news` search box, built like the community one: suggestions are
 * debounced against `/api/news/search` and never touch the URL, and the page
 * only filters once a term is committed (Enter or the "view all" row).
 *
 * A suggestion is a preview of a story, and a story has no page of its own: it
 * carries no body and no source link, so choosing one commits its headline and
 * the board answers with the story's card — where the plan's Card allowance
 * applies, exactly as it does to every other card. Committing a term drops the
 * selected day, because the search spans every retained day (`NewsFilters`).
 */
export function NewsSearch({ query, category, view, disabled = false }: NewsSearchProps) {
  const router = useRouter();
  const pathname = usePathname();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(query);
  const [hits, setHits] = useState<NewsSearchSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ReadFailure | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [active, setActive] = useState(-1);

  const commitQuery = useCallback(
    (next: string) => {
      if (disabled) return;
      router.push(newsHref(pathname, { q: next, category, view }), { scroll: false });
    },
    [category, disabled, pathname, router, view]
  );

  // Keep the field in step with the URL (back/forward, a cleared query).
  useEffect(() => {
    setValue(query);
  }, [query]);

  // Debounced suggestions.
  useEffect(() => {
    const trimmed = value.trim();
    if (disabled) {
      setHits([]);
      setOpen(false);
      setError(null);
      setLoading(false);
      return;
    }
    if (!trimmed) {
      setHits([]);
      setOpen(false);
      setError(null);
      setLoading(false);
      setActive(-1);
      return;
    }

    const controller = new AbortController();
    setError(null);
    const timer = setTimeout(() => {
      setLoading(true);
      request<NewsSearchSuggestions>(`/api/news/search?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
        .then((data) => {
          setHits(data.hits);
          setError(null);
          setOpen(true);
          setActive(-1);
        })
        .catch((failure: unknown) => {
          if (controller.signal.aborted) return;
          // A failed read is not "no results" (ADR-0031), so the panel names the
          // failure and offers the same request again.
          setHits([]);
          setError(toReadFailure(failure, SEARCH_ERROR));
          setOpen(true);
          setActive(-1);
        })
        .finally(() => setLoading(false));
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, retryKey, disabled]);

  // Dismiss on outside pointer down.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const allIndex = hits.length;
  const rowCount = hits.length + (value.trim() ? 1 : 0);

  const handleClear = useCallback(() => {
    setValue('');
    setHits([]);
    setError(null);
    setOpen(false);
    commitQuery('');
  }, [commitQuery]);

  const handleRetry = useCallback(() => {
    setLoading(true);
    setRetryKey((key) => key + 1);
  }, []);

  const activate = useCallback(
    (row: number) => {
      setOpen(false);
      const hit = hits[row];
      // A suggestion carries no source link, so it is committed rather than
      // opened off-site: the board answers with that story's card (and the
      // plan's allowance decides how many cards it may paint).
      commitQuery(hit ? sanitizeNewsQuery(hit.headline) : value.trim());
    },
    [hits, commitQuery, value]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setOpen(true);
        setActive((current) => Math.min(current + 1, rowCount - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((current) => Math.max(current - 1, -1));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (open && active >= 0) {
          activate(active);
        } else {
          setOpen(false);
          commitQuery(value.trim());
        }
      } else if (event.key === 'Escape') {
        setOpen(false);
        setActive(-1);
      }
    },
    [open, active, rowCount, activate, commitQuery, value]
  );

  const showPanel = open && Boolean(value.trim());

  const optionClass = (isActive: boolean) =>
    `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition-safe duration-150 ${
      isActive ? 'bg-muted/60' : 'hover:bg-muted/40'
    }`;

  return (
    <div ref={wrapperRef} className="relative">
      <Search
        className="pointer-events-none absolute inset-s-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/40"
        aria-hidden="true"
      />
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onFocus={() => value.trim() && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="ابحث في أخبار آخر 30 يومًا"
        aria-label="ابحث في الأخبار"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="news-search-listbox"
        aria-autocomplete="list"
        aria-activedescendant={
          showPanel && active >= 0 ? `news-search-option-${active}` : undefined
        }
        autoComplete="off"
        className="h-11 w-full rounded-xl border border-border/50 bg-background/60 ps-10 pe-10 text-sm outline-none transition-safe placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
      />

      {loading ? (
        <Loader2
          className="absolute inset-e-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-primary/70"
          aria-hidden="true"
        />
      ) : (
        value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute inset-e-3 top-1/2 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-muted-foreground/20 text-muted-foreground transition-colors hover:bg-muted-foreground/30"
            aria-label="إلغاء البحث"
          >
            <X className="size-3" />
          </button>
        )
      )}

      {showPanel && (
        <div
          id="news-search-listbox"
          role="listbox"
          aria-label="نتائج البحث"
          className="absolute inset-x-0 top-full z-50 mt-2 max-h-[26rem] overflow-y-auto overscroll-contain rounded-2xl border border-border/70 bg-popover p-2 shadow-2xl shadow-background/70"
        >
          {error ? (
            <div role="presentation">
              <ReadFailureNotice
                failure={error}
                onRetry={handleRetry}
                variant="inline"
                className="my-4"
              />
            </div>
          ) : (
            <>
              {!loading && hits.length === 0 && (
                <p
                  role="presentation"
                  className="px-3 py-6 text-center text-sm text-muted-foreground"
                >
                  لا توجد نتائج لـ &ldquo;{value.trim()}&rdquo;
                </p>
              )}

              {hits.length > 0 && (
                <div role="group" aria-label="أخبار" className="mb-1">
                  <p
                    role="presentation"
                    className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    أخبار
                  </p>
                  <div role="presentation">
                    {hits.map((hit, index) => (
                      <button
                        key={hit.id}
                        type="button"
                        id={`news-search-option-${index}`}
                        role="option"
                        aria-selected={active === index}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => activate(index)}
                        className={optionClass(active === index)}
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/40 text-muted-foreground">
                          <Newspaper className="size-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {hit.headline}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {NEWS_CATEGORY_LABELS[hit.category]} · {hit.sourceName} ·{' '}
                            {formatDigestDayShort(hit.digestDate)}
                          </span>
                        </span>
                        <ArrowUpLeft
                          className="size-4 shrink-0 text-muted-foreground/50"
                          aria-hidden="true"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {value.trim() && (
                <button
                  type="button"
                  id={`news-search-option-${allIndex}`}
                  role="option"
                  aria-selected={active === allIndex}
                  onMouseEnter={() => setActive(allIndex)}
                  onClick={() => activate(allIndex)}
                  className={`flex w-full items-center gap-3 rounded-xl border-t border-border/50 px-3 py-3 text-start text-sm font-bold text-primary transition-safe duration-150 ${
                    active === allIndex ? 'bg-primary/10' : 'hover:bg-primary/5'
                  }`}
                >
                  <Search className="size-4" aria-hidden="true" />
                  <span className="truncate">عرض كل النتائج لـ &ldquo;{value.trim()}&rdquo;</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
