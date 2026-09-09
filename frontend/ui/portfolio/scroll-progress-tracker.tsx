'use client';

import { useEffect, useRef } from 'react';

/**
 * Minimal client island that tracks horizontal scroll position and sets
 * a CSS custom property --scroll-progress (0..1) on the target element.
 * The progress bar uses CSS transform: scaleX(var(--scroll-progress)).
 */
export function ScrollProgressTracker({
  containerRef,
  targetRef,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  targetRef: React.RefObject<HTMLDivElement | null>;
}) {
  const rafId = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    const target = targetRef.current;
    if (!container || !target) return;

    const update = () => {
      const { scrollLeft, scrollWidth, clientWidth } = container;
      const maxScroll = scrollWidth - clientWidth;
      const progress = maxScroll > 0 ? scrollLeft / maxScroll : 0;
      target.style.setProperty('--scroll-progress', String(progress));
    };

    const onScroll = () => {
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(update);
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    update();

    return () => {
      container.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafId.current);
    };
  }, [containerRef, targetRef]);

  return null;
}
