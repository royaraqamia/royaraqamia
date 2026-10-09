'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, FileText, Loader2, Search, X } from 'lucide-react';
import { MemberAvatar } from '@/frontend/ui/shared/member-avatar';
import { postExcerpt } from '@/shared/reading-time';
import type { CommunitySearchResult } from '@/shared/contracts/community';

type Row = { kind: 'person'; index: number } | { kind: 'post'; index: number } | { kind: 'all' };

const EMPTY_RESULTS: CommunitySearchResult = { people: [], posts: [] };

export function CommunitySearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get('q') ?? '';

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(query);
  const [results, setResults] = useState<CommunitySearchResult | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);

  const commitQuery = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) {
        params.set('q', next);
      } else {
        params.delete('q');
      }
      params.delete('cursor');
      router.push(`/community?${params.toString()}`);
    },
    [router, searchParams]
  );

  // Keep the field in step with the URL (back/forward, external links).
  useEffect(() => {
    setValue(query);
  }, [query]);

  // Debounced suggestions. Suggestions never touch the URL; the feed only
  // filters once a query is committed (Enter or "view all").
  useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      setResults(null);
      setOpen(false);
      setActive(-1);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/community/search?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? (res.json() as Promise<CommunitySearchResult>) : EMPTY_RESULTS))
        .then((data) => {
          setResults(data);
          setOpen(true);
          setActive(-1);
        })
        .catch(() => {
          /* aborted or offline — leave the last results in place */
        })
        .finally(() => setLoading(false));
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  // Dismiss on outside pointer down.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const people = useMemo(() => results?.people ?? [], [results]);
  const posts = useMemo(() => results?.posts ?? [], [results]);
  const hasResults = people.length > 0 || posts.length > 0;

  const allIndex = people.length + posts.length;
  const rows = useMemo<Row[]>(() => {
    const next: Row[] = [];
    people.forEach((_, index) => next.push({ kind: 'person', index }));
    posts.forEach((_, index) => next.push({ kind: 'post', index }));
    if (value.trim()) next.push({ kind: 'all' });
    return next;
  }, [people, posts, value]);

  const handleClear = useCallback(() => {
    setValue('');
    setResults(null);
    setOpen(false);
    commitQuery('');
  }, [commitQuery]);

  const activate = useCallback(
    (row: Row) => {
      setOpen(false);
      if (row.kind === 'person') {
        const person = people[row.index];
        if (person) router.push(`/u/${encodeURIComponent(person.username)}`);
        return;
      }
      if (row.kind === 'post') {
        const post = posts[row.index];
        if (post) router.push(`/community/${post.slug}`);
        return;
      }
      commitQuery(value.trim());
    },
    [people, posts, router, commitQuery, value]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setOpen(true);
        setActive((current) => Math.min(current + 1, rows.length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((current) => Math.max(current - 1, -1));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const row = open ? rows[active] : undefined;
        if (row) {
          activate(row);
        } else {
          setOpen(false);
          commitQuery(value.trim());
        }
      } else if (event.key === 'Escape') {
        setOpen(false);
        setActive(-1);
      }
    },
    [rows, active, open, activate, commitQuery, value]
  );

  const showPanel = open && Boolean(value.trim());

  const optionClass = (isActive: boolean) =>
    `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition-safe duration-150 ${
      isActive ? 'bg-muted/60' : 'hover:bg-muted/40'
    }`;

  return (
    <div ref={wrapperRef} className="relative">
      <Search
        className="pointer-events-none absolute inset-e-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/40"
        aria-hidden="true"
      />
      <input
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onFocus={() => value.trim() && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="ابحث عن أشخاص أو منشورات..."
        aria-label="ابحث عن أشخاص أو منشورات"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="community-search-listbox"
        aria-autocomplete="list"
        aria-activedescendant={
          showPanel && active >= 0 ? `community-search-option-${active}` : undefined
        }
        autoComplete="off"
        className="h-11 w-full rounded-xl border border-border/50 bg-background/60 ps-10 pe-10 text-sm outline-none transition-safe placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
      />

      {loading ? (
        <Loader2
          className="absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-primary/70"
          aria-hidden="true"
        />
      ) : (
        value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute inset-s-3 top-1/2 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-muted-foreground/20 text-muted-foreground transition-colors hover:bg-muted-foreground/30"
            aria-label="إلغاء البحث"
          >
            <X className="size-3" />
          </button>
        )
      )}

      {showPanel && (
        <div
          id="community-search-listbox"
          role="listbox"
          aria-label="نتائج البحث"
          className="absolute inset-x-0 top-full z-50 mt-2 max-h-[26rem] overflow-y-auto overscroll-contain rounded-2xl border border-border/70 bg-popover p-2 shadow-2xl shadow-background/70"
        >
          {!hasResults && !loading && (
            <p role="presentation" className="px-3 py-6 text-center text-sm text-muted-foreground">
              لا توجد نتائج لـ &ldquo;{value.trim()}&rdquo;
            </p>
          )}

          {people.length > 0 && (
            <div role="group" aria-label="أشخاص" className="mb-1">
              <p
                role="presentation"
                className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
              >
                أشخاص
              </p>
              <div role="presentation">
                {people.map((person, index) => (
                  <button
                    key={person.id}
                    type="button"
                    id={`community-search-option-${index}`}
                    role="option"
                    aria-selected={active === index}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => activate({ kind: 'person', index })}
                    className={optionClass(active === index)}
                  >
                    <MemberAvatar
                      name={person.name}
                      avatarUrl={person.avatar_url}
                      size="sm"
                      sizes="36px"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-foreground">
                        {person.name?.trim() || `@${person.username}`}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground" dir="ltr">
                        @{person.username}
                      </span>
                    </span>
                    <ArrowLeft
                      className="size-4 shrink-0 text-muted-foreground/50"
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {posts.length > 0 && (
            <div role="group" aria-label="منشورات" className="mb-1">
              <p
                role="presentation"
                className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
              >
                منشورات
              </p>
              <div role="presentation">
                {posts.map((post, index) => {
                  const rowIndex = people.length + index;
                  const label =
                    post.meta_desc?.trim() || postExcerpt(post.content, post.meta_desc ?? '');
                  return (
                    <button
                      key={post.id}
                      type="button"
                      id={`community-search-option-${rowIndex}`}
                      role="option"
                      aria-selected={active === rowIndex}
                      onMouseEnter={() => setActive(rowIndex)}
                      onClick={() => activate({ kind: 'post', index })}
                      className={optionClass(active === rowIndex)}
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/40 text-muted-foreground">
                        <FileText className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {label || 'بدون عنوان'}
                        </span>
                        <span className="block text-xs text-muted-foreground">منشور</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {value.trim() && (
            <button
              type="button"
              id={`community-search-option-${allIndex}`}
              role="option"
              aria-selected={active === allIndex}
              onMouseEnter={() => setActive(allIndex)}
              onClick={() => activate({ kind: 'all' })}
              className={`flex w-full items-center gap-3 rounded-xl border-t border-border/50 px-3 py-3 text-start text-sm font-bold text-primary transition-safe duration-150 ${
                active === allIndex ? 'bg-primary/10' : 'hover:bg-primary/5'
              }`}
            >
              <Search className="size-4" aria-hidden="true" />
              <span className="truncate">عرض كل النتائج لـ &ldquo;{value.trim()}&rdquo;</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
