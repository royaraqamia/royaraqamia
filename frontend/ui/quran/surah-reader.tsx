import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { QuranReadingClient } from './quran-reading-client';
import { revelationLabel } from './format';
import type { Surah, SurahSummary } from '@/shared/contracts/quran';

interface SurahReaderProps {
  surah: Surah;
  /**
   * The sura's line in the index. The header shows the revelation place and the
   * ayah count, and the text file carries neither, so it comes from the index.
   */
  summary: SurahSummary;
  /** Null when this sura has no vendored Recitation (ADR-0062). */
  audio: { ayahCount: number; bytes: number } | null;
}

/**
 * One sura, ayah by ayah (ADR-0056, P1a).
 *
 * A server component: the text is vendored, so the whole sura renders into the
 * HTML at build time and reading it needs no client bundle. Each ayah is its own
 * card with a stable id, which is what a Bookmark and a Reading position point
 * at, and its ayah number doubles as the control that marks it.
 *
 * The card is the seam for the next phase: Tafsir will sit in the reserved slot
 * below each ayah's text, without rearranging the reading surface.
 *
 * Deliberately verse-by-verse rather than a Mushaf page: page and line breaks are
 * a separate view of the same text (P5), not the base rendering.
 */
export function SurahReader({ surah, summary, audio }: SurahReaderProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-4 py-8 sm:py-12">
      <header className="flex flex-col items-center gap-2 text-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>{summary.name}</SectionTitleHighlight>
        </SectionTitle>
        <p className="text-xs text-muted-foreground">
          {revelationLabel(summary.revelation)} ·{' '}
          <span className="font-heading">{summary.ayahCount}</span> آيات
        </p>
      </header>

      <QuranReadingClient surah={summary.n} bismillah={surah.bismillah} audio={audio}>
        {surah.ayahs.map((ayah, position) => {
          const number = position + 1;
          return (
            <article
              key={number}
              data-ayah-card={number}
              className="rounded-2xl border border-border/60 bg-card/50 px-4 py-4 shadow-xs sm:px-5"
            >
              <div className="flex items-center">
                <button
                  type="button"
                  data-bookmark-ayah={number}
                  aria-pressed="false"
                  disabled
                  aria-label={`علامة على الآية ${number}`}
                  title="إضافة علامة أو إزالتها"
                  className="inline-flex size-8 select-none items-center justify-center rounded-full border border-primary/25 bg-primary/5 font-heading text-sm font-bold text-primary transition-safe hover:border-primary/60 hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground disabled:opacity-60"
                >
                  {number}
                </button>
              </div>

              <p
                id={`ayah-${number}`}
                data-ayah={number}
                className="font-quran mt-3 scroll-mt-28 text-2xl leading-[2.4] text-foreground sm:text-3xl sm:leading-[2.5]"
              >
                {ayah}
              </p>

              {/* The Tafsir slot is reserved now, so the next phase only fills it. */}
              <div data-tafsir-slot={number} />
            </article>
          );
        })}
      </QuranReadingClient>
    </div>
  );
}
