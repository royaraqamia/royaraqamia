'use client';

import { useEffect } from 'react';

/** The attribute `app/global.css` reads to paint a scrollbar mid-gesture. */
const SCROLLING_ATTRIBUTE = 'data-scrollbar-scrolling';

/** How long a bar stays painted after the last scroll event. */
const LINGER_MS = 700;

/**
 * Reveals a scroll container's bar while it is actually scrolling.
 *
 * The stylesheet paints every scrollbar transparent until `:hover` (or a
 * `lg`-and-up viewport is there at all), and CSS has no `:scrolling` state. So
 * this marks the element that scrolled — `document.scrollingElement` for the
 * page — and clears the mark once the gesture has been quiet for `LINGER_MS`.
 * Capture is what sees scrolls on any container, since `scroll` does not
 * bubble.
 */
export function ScrollbarReveal() {
  useEffect(() => {
    const timers = new Map<Element, number>();

    const mark = (target: Element) => {
      if (!target.hasAttribute(SCROLLING_ATTRIBUTE)) {
        target.setAttribute(SCROLLING_ATTRIBUTE, '');
      }
      const existing = timers.get(target);
      if (existing !== undefined) window.clearTimeout(existing);
      timers.set(
        target,
        window.setTimeout(() => {
          target.removeAttribute(SCROLLING_ATTRIBUTE);
          timers.delete(target);
        }, LINGER_MS)
      );
    };

    const onScroll = (event: Event) => {
      const target = event.target instanceof Element ? event.target : document.scrollingElement;
      if (target) mark(target);
    };

    document.addEventListener('scroll', onScroll, { capture: true, passive: true });

    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      for (const [target, timer] of timers) {
        window.clearTimeout(timer);
        target.removeAttribute(SCROLLING_ATTRIBUTE);
      }
      timers.clear();
    };
  }, []);

  return null;
}
