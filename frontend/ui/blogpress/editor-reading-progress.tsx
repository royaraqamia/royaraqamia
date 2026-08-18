'use client';

import { useEffect, useState, type RefObject } from 'react';

/**
 * Reading-progress bar for the editor. Unlike the public article version this
 * tracks the internal ProseMirror scroll container instead of the window.
 */
export function EditorReadingProgress({
  scrollContainerRef,
}: {
  scrollContainerRef: RefObject<HTMLElement | null>;
}) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const getScrollElement = () =>
      scrollContainerRef.current?.querySelector('.ProseMirror') ?? scrollContainerRef.current;

    const handleScroll = () => {
      const el = getScrollElement();
      if (!el) return;
      const scrollable = el.scrollHeight - el.clientHeight;
      const pct = scrollable > 0 ? (el.scrollTop / scrollable) * 100 : 0;
      setProgress(Math.min(Math.max(pct, 0), 100));
    };

    const el = getScrollElement();
    el?.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => el?.removeEventListener('scroll', handleScroll);
  }, [scrollContainerRef]);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-60 h-0.75 bg-transparent pointer-events-none"
      aria-hidden="true"
    >
      <div
        className="h-full bg-linear-to-l from-primary via-primary/80 to-primary/40 transition-[width] duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
