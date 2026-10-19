'use client';

import { useCallback, useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { useQuranReader } from '@/frontend/state/quran/use-quran-reader';
import { QuranSyncStatus } from './sync-status';
import { observeReadingLine } from './reading-line';

/** How long the reader rests on an ayah before it is worth writing down. */
const POSITION_WRITE_DELAY_MS = 1200;

interface ReadingSessionProps {
  /** The sura being read; the position and every mark below belong to it. */
  surah: number;
  className?: string;
  children: ReactNode;
}

/**
 * The reader's own state for one sura: where they are in it, and which of its
 * ayat they marked (ADR-0056).
 *
 * The ayat themselves arrive as server-rendered children, so React never
 * re-renders them: marks are painted onto the buttons directly and one listener
 * on this container handles every ayah. A sura of 286 ayat therefore contributes
 * exactly one client component, and reading it needs no JavaScript at all.
 */
export function ReadingSession({ surah, className, children }: ReadingSessionProps) {
  const reader = useQuranReader();
  const { ready, bookmarks, savePosition, toggleBookmark } = reader;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pendingRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  /** Writes whatever ayah is pending, now. */
  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const ayah = pendingRef.current;
    pendingRef.current = null;
    if (ayah !== null) void savePosition(surah, ayah);
  }, [surah, savePosition]);

  // The line reports an ayah at a time; the position is only worth persisting
  // once the reader has settled on one.
  const note = useCallback(
    (ayah: number) => {
      pendingRef.current = ayah;
      if (timerRef.current !== null) return;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending !== null) void savePosition(surah, pending);
      }, POSITION_WRITE_DELAY_MS);
    },
    [surah, savePosition]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !ready) return;

    const stop = observeReadingLine(container, note);
    // A session can end by switching tabs rather than by scrolling, and that
    // last ayah is the one most worth resuming from.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stop();
      flush();
    };
  }, [ready, note, flush]);

  // The marks are painted imperatively because the buttons are children this
  // component did not render. It also means the visible state and the accessible
  // one cannot drift: the styling keys off `aria-pressed` itself.
  //
  // They stay disabled until the store is open, because before that nothing can
  // be saved — IndexedDB takes a moment, and may never arrive at all. A control
  // that silently does nothing is worse than one that says it cannot.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !ready) return;

    const marked = new Set(
      bookmarks.filter((bookmark) => bookmark.surah === surah).map((bookmark) => bookmark.ayah)
    );
    container.querySelectorAll<HTMLButtonElement>('[data-bookmark-ayah]').forEach((button) => {
      const ayah = Number(button.dataset.bookmarkAyah);
      button.disabled = false;
      button.setAttribute('aria-pressed', marked.has(ayah) ? 'true' : 'false');
    });
  }, [ready, bookmarks, surah]);

  /** One listener for the whole sura, rather than a handler per ayah. */
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-bookmark-ayah]');
    if (!button) return;
    const ayah = Number(button.dataset.bookmarkAyah);
    if (!Number.isFinite(ayah)) return;
    void toggleBookmark(surah, ayah);
  };

  return (
    <div ref={containerRef} onClick={onClick} className={className}>
      <QuranSyncStatus reader={reader} />
      {children}
    </div>
  );
}
