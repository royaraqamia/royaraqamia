import Link from 'next/link';

import { QURAN_INDEX_COPY } from './quran-index-copy';
import type { SurahSummary } from '@/shared/contracts/quran';

/** The list's words, from `shared/copy/quran-index.json`. */
export interface SurahIndexListCopy {
  emptyList: string;
  revelationMeccan: string;
  revelationMedinan: string;
  ayahCount: string;
}

/**
 * The 114 suras as a grid, in the order of the text.
 *
 * A presenter: the list it is handed is already the list to draw. The field that
 * narrows it belongs to `QuranSearch`, which also filters the Ayat — one box that
 * answers both questions rather than two that each answer half of one (P4).
 *
 * Each card is a plain link, so the index still works with no JavaScript at all;
 * only the narrowing needs the client.
 */
const DEFAULT_COPY: SurahIndexListCopy = {
  emptyList: QURAN_INDEX_COPY.emptyList,
  revelationMeccan: QURAN_INDEX_COPY.revelationMeccan,
  revelationMedinan: QURAN_INDEX_COPY.revelationMedinan,
  ayahCount: QURAN_INDEX_COPY.ayahCount,
};

export function SurahIndexList({
  surahs,
  copy = DEFAULT_COPY,
}: {
  surahs: readonly SurahSummary[];
  copy?: SurahIndexListCopy;
}) {
  return (
    <div className="flex flex-col gap-4">
      {surahs.length > 0 ? (
        <nav
          aria-label="فهرس السُّوَر"
          data-visual="quran-list"
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
        >
          {surahs.map((surah, index) => (
            <Link
              key={surah.n}
              href={`/quran/${surah.n}`}
              data-visual={`quran-row-${index}`}
              className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 px-3 py-2.5 transition-safe hover:border-border/90 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <span
                aria-hidden="true"
                data-visual={`quran-row-number-${index}`}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-heading text-sm font-bold text-primary transition-colors group-hover:bg-primary/15"
              >
                {surah.n}
              </span>
              <span className="flex min-w-0 flex-col">
                <span
                  data-visual={`quran-row-name-${index}`}
                  className="truncate font-bold text-foreground transition-colors group-hover:text-primary"
                >
                  {surah.name}
                </span>
                <span
                  data-visual={`quran-row-meta-${index}`}
                  className="text-[11px] text-muted-foreground"
                >
                  {surah.revelation === 'Meccan' ? copy.revelationMeccan : copy.revelationMedinan} ·{' '}
                  <span className="font-heading">{surah.ayahCount}</span> {copy.ayahCount}
                </span>
              </span>
            </Link>
          ))}
        </nav>
      ) : (
        <p className="rounded-2xl border border-border/60 bg-card/60 p-6 text-center text-sm text-muted-foreground">
          {copy.emptyList}
        </p>
      )}
    </div>
  );
}
