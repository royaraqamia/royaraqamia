'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';

import { revelationLabel } from './format';
import type { SurahSummary } from '@/shared/contracts/quran';

/**
 * The reader may type a name with the marks or without them, and with any of
 * the hamza spellings the same sound takes — so the comparison drops the marks
 * and folds the letters that only differ in how they are written.
 */
function normalise(value: string): string {
  return value
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .trim();
}

/**
 * The 114 suras, narrowed by name as the reader types.
 *
 * The filter runs over the list the page already rendered, so it costs no
 * request and works offline like the text it filters. Searching the ayat
 * themselves is a separate concern (P4) and is not part of this.
 */
export function SurahIndexList({ surahs }: { surahs: readonly SurahSummary[] }) {
  const [query, setQuery] = useState('');
  const needle = normalise(query);

  const visible = useMemo(
    () => (needle ? surahs.filter((surah) => normalise(surah.name).includes(needle)) : surahs),
    [needle, surahs]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute inset-s-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/40"
          aria-hidden="true"
        />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ابحث عن سُورة"
          aria-label="ابحث عن سُورة"
          autoComplete="off"
          className="h-11 w-full rounded-xl border border-border/50 bg-background/60 ps-10 pe-10 text-sm outline-none transition-safe placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
        />

        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute inset-e-3 top-1/2 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-muted-foreground/20 text-muted-foreground transition-colors hover:bg-muted-foreground/30"
            aria-label="إلغاء البحث"
          >
            <X className="size-3" />
          </button>
        ) : null}
      </div>

      <p className="sr-only" role="status">
        {needle ? `${visible.length} سورة مطابقة` : ''}
      </p>

      {visible.length > 0 ? (
        <nav aria-label="فهرس السُّوَر" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((surah) => (
            <Link
              key={surah.n}
              href={`/quran/${surah.n}`}
              className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 px-3 py-2.5 transition-safe hover:border-border/90 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-heading text-sm font-bold text-primary transition-colors group-hover:bg-primary/15"
              >
                {surah.n}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-bold text-foreground transition-colors group-hover:text-primary">
                  {surah.name}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {revelationLabel(surah.revelation)} ·{' '}
                  <span className="font-heading">{surah.ayahCount}</span> آيات
                </span>
              </span>
            </Link>
          ))}
        </nav>
      ) : (
        <p className="rounded-2xl border border-border/60 bg-card/60 p-6 text-center text-sm text-muted-foreground">
          لا توجد سُورة بهذا الاسم.
        </p>
      )}
    </div>
  );
}
