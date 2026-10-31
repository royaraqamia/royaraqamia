import { Bookmark } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { QuranReadingClient } from './quran-reading-client';
import { AyahAnchorHighlight } from './ayah-highlight';
import { AyahTafsir, QuranTafsirProvider } from './ayah-tafsir';
import { revelationLabel } from './format';
import type { Surah, SurahSummary } from '@/shared/contracts/quran';
import type { SurahTafsirRef } from '@/shared/contracts/quran-tafsir';

interface SurahReaderProps {
  surah: Surah;
  /**
   * The sura's line in the index. The header shows the revelation place and the
   * ayah count, and the text file carries neither, so it comes from the index.
   */
  summary: SurahSummary;
  /** Null when this sura has no vendored Recitation (ADR-0062). */
  audio: { ayahCount: number } | null;
  /** Null when no tafsir is vendored for this sura (ADR-0057). */
  tafsir: SurahTafsirRef | null;
}

/**
 * One sura, ayah by ayah (ADR-0056, P1a).
 *
 * A server component: the text is vendored, so the whole sura renders into the
 * HTML at build time and reading it needs no client bundle. Each ayah is its own
 * card with a stable id, which is what a Bookmark and a Reading position point
 * at. The ayah's number closes its text inside the mushaf's own rosette
 * (`app/quran/quran.css`), and the mark beside it is the control that saves it —
 * the number itself only names the Ayah.
 *
 * The card is the seam the Tafsir fills: its body sits in the slot below each
 * Ayah's text, without rearranging the reading surface.
 *
 * Deliberately verse-by-verse rather than a Mushaf page: page and line breaks are
 * a separate view of the same text (P5), not the base rendering.
 */
export function SurahReader({ surah, summary, audio, tafsir }: SurahReaderProps) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-3xl flex-col px-4 py-8 sm:py-12',
        // The recitation control floats over the reader, so the last Ayah has to
        // end above it rather than under it.
        audio && 'pb-32 sm:pb-36'
      )}
    >
      {/* One hero gradient, defined once: a saved Ayah's mark is filled with it,
          and every mark on the page points at this definition by id. */}
      <svg aria-hidden="true" focusable="false" className="absolute size-0">
        <defs>
          <linearGradient id="ayah-mark-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#9333ea" />
            <stop offset="50%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#4f46e5" />
          </linearGradient>
        </defs>
      </svg>

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
        <AyahAnchorHighlight />
        <QuranTafsirProvider tafsir={tafsir}>
          {surah.ayahs.map((ayah, position) => {
            const number = position + 1;
            // The number and the mark close the Ayah, so they stay on the line the
            // text ends on: the last word travels with them rather than leaving
            // them alone on a line of their own.
            const lastSpace = ayah.lastIndexOf(' ');
            const head = lastSpace === -1 ? '' : ayah.slice(0, lastSpace + 1);
            const lastWord = lastSpace === -1 ? ayah : ayah.slice(lastSpace + 1);

            return (
              <article
                key={number}
                data-ayah-card={number}
                className="rounded-2xl border border-border/60 bg-card/50 px-4 py-4 shadow-xs sm:px-5"
              >
                <p
                  id={`ayah-${number}`}
                  data-ayah={number}
                  className="font-quran scroll-mt-28 text-2xl leading-[2.4] text-foreground sm:text-3xl sm:leading-[2.5]"
                >
                  {head}
                  <span className="ayah-tail">
                    {lastWord}
                    <span className="ayah-marker" data-ayah-marker={number}>
                      <span className="ayah-marker-number">{number}</span>
                    </span>
                    <button
                      type="button"
                      data-bookmark-ayah={number}
                      aria-pressed="false"
                      disabled
                      aria-label={`علامة على الآية ${number}`}
                      title="إضافة علامة أو إزالتها"
                      className="ayah-mark"
                    >
                      <Bookmark aria-hidden="true" />
                    </button>
                  </span>
                </p>

                <div data-tafsir-slot={number}>
                  <AyahTafsir ayah={number} />
                </div>
              </article>
            );
          })}
        </QuranTafsirProvider>
      </QuranReadingClient>
    </div>
  );
}
