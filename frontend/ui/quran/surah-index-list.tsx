import Link from 'next/link';

import { revelationLabel } from './format';
import type { SurahSummary } from '@/shared/contracts/quran';

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
export function SurahIndexList({ surahs }: { surahs: readonly SurahSummary[] }) {
  return (
    <div className="flex flex-col gap-4">
      {surahs.length > 0 ? (
        <nav aria-label="فهرس السُّوَر" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {surahs.map((surah) => (
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
