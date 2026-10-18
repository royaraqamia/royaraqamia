import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SectionTitle } from '@/frontend/ui/shared/section-title';
import { QuranAttribution } from './attribution';
import { revelationLabel, toArabicDigits } from './format';
import type { Surah, SurahSummary } from '@/shared/contracts/quran';

interface SurahReaderProps {
  surah: Surah;
  /**
   * The sura's line in the index. The header shows the revelation place and the
   * ayah count, and the text file carries neither, so it comes from the index.
   */
  summary: SurahSummary;
  previous: SurahSummary | null;
  next: SurahSummary | null;
}

/**
 * One sura, ayah by ayah (ADR-0056, P1a).
 *
 * A server component: the text is vendored, so the whole sura renders into the
 * HTML at build time and reading it needs no client bundle. Each ayah is its own
 * block with a stable id, which is what a Bookmark and a Reading position will
 * point at once they exist.
 *
 * Deliberately verse-by-verse rather than a Mushaf page: page and line breaks are
 * a separate view of the same text (P5), not the base rendering.
 */
export function SurahReader({ surah, summary, previous, next }: SurahReaderProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-4 py-8 sm:py-12">
      <header className="flex flex-col items-center gap-2 text-center">
        <Link
          href="/quran"
          className="rounded-lg px-2 py-1 text-xs text-muted-foreground transition-safe hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          فهرس السُّوَر
        </Link>
        <SectionTitle as="h1" className="font-heading">
          {summary.name}
        </SectionTitle>
        <p className="text-xs text-muted-foreground">
          {revelationLabel(summary.revelation)} · {toArabicDigits(summary.ayahCount)} آية
        </p>
      </header>

      {surah.bismillah && (
        <p className="font-quran mt-8 text-center text-2xl leading-[2.4] text-foreground sm:text-3xl">
          {surah.bismillah}
        </p>
      )}

      <div className="mt-10 flex flex-col gap-6 sm:gap-7">
        {surah.ayahs.map((ayah, position) => {
          const number = position + 1;
          return (
            <p
              key={number}
              id={`ayah-${number}`}
              className="font-quran scroll-mt-28 text-2xl leading-[2.4] text-foreground sm:text-3xl sm:leading-[2.5]"
            >
              {ayah}
              <span className="mx-1.5 inline-flex size-8 select-none items-center justify-center rounded-full border border-primary/25 bg-primary/5 align-middle text-xs font-bold text-primary">
                {toArabicDigits(number)}
              </span>
            </p>
          );
        })}
      </div>

      <nav aria-label="التَّنقُّل بين السُّوَر" className="mt-12 grid grid-cols-2 gap-3">
        <SurahStep surah={previous} direction="previous" />
        <SurahStep surah={next} direction="next" />
      </nav>

      <QuranAttribution />
    </div>
  );
}

function SurahStep({
  surah,
  direction,
}: {
  surah: SurahSummary | null;
  direction: 'previous' | 'next';
}) {
  if (!surah) return <span aria-hidden="true" />;

  const isNext = direction === 'next';
  const Icon = isNext ? ChevronRight : ChevronLeft;

  return (
    <Link
      href={`/quran/${surah.n}`}
      className={`flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2.5 transition-safe hover:border-border/90 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
        isNext ? 'justify-end text-end' : ''
      }`}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-col">
        <span className="text-[11px] text-muted-foreground">
          {isNext ? 'السُّورة التَّالية' : 'السُّورة السَّابقة'}
        </span>
        <span className="truncate text-sm font-bold text-foreground">{surah.name}</span>
      </span>
    </Link>
  );
}
