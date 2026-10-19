'use client';

import Link from 'next/link';
import { BookMarked, BookOpenCheck, X } from 'lucide-react';
import { useQuranReader } from '@/frontend/state/quran/use-quran-reader';
import { QuranSyncStatus } from './sync-status';
import { toArabicDigits } from './format';

interface ReadingPanelProps {
  /**
   * The suras' names, indexed by `surah - 1`.
   *
   * The panel only ever names a handful of suras, so it is handed the names
   * rather than the whole index — the page has already rendered that, and a
   * second copy of it would be a second copy of the record.
   */
  names: readonly string[];
}

/**
 * What a reader brings back to the index: where they stopped, and what they
 * marked. Both live in the Local Store (ADR-0056), so this renders nothing until
 * it opens on the client — the index itself is static HTML and never waits on
 * it.
 */
export function ReadingPanel({ names }: ReadingPanelProps) {
  const reader = useQuranReader();
  const { ready, readingPosition, bookmarks, removeBookmark } = reader;
  if (!ready || (!readingPosition && bookmarks.length === 0)) return null;

  const nameOf = (surah: number) => names[surah - 1] ?? '';

  return (
    <div className="flex flex-col gap-3">
      <QuranSyncStatus reader={reader} />
      {readingPosition ? (
        <Link
          href={`/quran/${readingPosition.surah}#ayah-${readingPosition.ayah}`}
          className="group flex items-center gap-4 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3.5 transition-safe hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <BookOpenCheck aria-hidden="true" className="size-5 shrink-0 text-primary" />
          <span className="flex min-w-0 flex-col">
            <span className="text-[11px] text-muted-foreground">أكمل القراءة</span>
            <span className="truncate font-bold text-foreground">
              {nameOf(readingPosition.surah)} · الآية {toArabicDigits(readingPosition.ayah)}
            </span>
          </span>
        </Link>
      ) : null}

      {bookmarks.length > 0 ? (
        <section
          aria-label="علاماتي"
          className="rounded-2xl border border-border/60 bg-card/60 px-4 py-3.5"
        >
          <p className="flex items-center gap-2 text-sm font-bold text-foreground">
            <BookMarked aria-hidden="true" className="size-4 text-primary" />
            علاماتي
            <span className="font-normal text-muted-foreground">
              ({toArabicDigits(bookmarks.length)})
            </span>
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {bookmarks.map((bookmark) => (
              <li
                key={bookmark.clientId}
                className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-background/60 pe-1"
              >
                <Link
                  href={`/quran/${bookmark.surah}#ayah-${bookmark.ayah}`}
                  className="px-2.5 py-1.5 text-xs font-bold text-foreground transition-safe hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {nameOf(bookmark.surah)} · {toArabicDigits(bookmark.ayah)}
                </Link>
                <button
                  type="button"
                  onClick={() => void removeBookmark(bookmark.clientId)}
                  aria-label={`إزالة علامة ${nameOf(bookmark.surah)} الآية ${toArabicDigits(
                    bookmark.ayah
                  )}`}
                  className="rounded-md p-1 text-muted-foreground transition-safe hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
