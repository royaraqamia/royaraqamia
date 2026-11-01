'use client';

import { useEffect } from 'react';

/**
 * How much of the screen the on-screen keyboard has to take before it counts as
 * open. A phone keyboard is never shorter than ~200px; a mobile browser's
 * collapsing URL bar moves the layout viewport by well under this, and counting
 * that as a keyboard would hide a footer nobody asked to hide.
 */
const OPEN_AT_LEAST = 140;

/** The length a full-bleed surface takes off its height, read by `app/global.css`. */
const COVER = '--roy-keyboard-cover';

/** The attribute `app/global.css` keys its keyboard rules off. */
const OPEN_ATTRIBUTE = 'data-keyboard';

/** How many surfaces hold the watcher open; the last one closing stops it. */
let watching = 0;
let stop: (() => void) | null = null;

/**
 * Publishes the on-screen keyboard to the stylesheet while a dialog holds the
 * focus: `data-keyboard="open"` on `<html>`, and `--roy-keyboard-cover` — the
 * strip a browser hides *inside* the visual viewport instead of shrinking the
 * layout one.
 *
 * Chrome and the Android shell honour `interactive-widget: resizes-content`
 * (declared in `app/layout.tsx`), so `100dvh` already ends where the keyboard
 * begins and the cover stays `0`. Safari does not, so it carries the whole
 * keyboard height and a full-bleed dialog takes it off the top rather than being
 * drawn under the keyboard.
 *
 * The baseline is the tallest layout viewport seen since the keyboard closed: a
 * keyboard can only make it shorter, so the gap is the keyboard itself
 * (`visualViewport` alone cannot tell them apart — it follows a layout viewport
 * that already shrank for the keyboard).
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    watching += 1;
    stop ??= startWatching();

    return () => {
      watching -= 1;
      if (watching > 0) return;
      stop?.();
      stop = null;
    };
  }, []);
}

function startWatching(): () => void {
  const root = document.documentElement;
  const viewport = window.visualViewport ?? null;
  let baseline = window.innerHeight;

  const publish = () => {
    const layout = window.innerHeight;
    const visual = viewport ? viewport.height : layout;

    // The keyboard's strip: hidden inside the visual viewport (Safari), or gone
    // from the layout viewport itself (Chrome, the Android WebView).
    const covered = Math.max(0, Math.round(layout - visual));
    const shrank = Math.max(0, Math.round(baseline - layout));
    const open = Math.max(covered, shrank) >= OPEN_AT_LEAST;

    // A closed keyboard is the only honest baseline: every other reading is one
    // that a keyboard (or a collapsing URL bar) is holding down.
    if (!open) baseline = layout;

    root.style.setProperty(COVER, `${open ? covered : 0}px`);
    if (open) root.setAttribute(OPEN_ATTRIBUTE, 'open');
    else root.removeAttribute(OPEN_ATTRIBUTE);
  };

  // `resize` covers the layout shrink (Chrome, the Android WebView);
  // `visualViewport.resize` covers the browser that only shrinks what is drawn
  // (Safari), and its `scroll` fires when a focused field is panned into sight.
  // A rotated phone is a new baseline, not a keyboard.
  const reset = () => {
    baseline = window.innerHeight;
    publish();
  };

  publish();
  window.addEventListener('resize', publish);
  window.addEventListener('orientationchange', reset);
  viewport?.addEventListener('resize', publish);
  viewport?.addEventListener('scroll', publish);

  return () => {
    window.removeEventListener('resize', publish);
    window.removeEventListener('orientationchange', reset);
    viewport?.removeEventListener('resize', publish);
    viewport?.removeEventListener('scroll', publish);
    root.style.removeProperty(COVER);
    root.removeAttribute(OPEN_ATTRIBUTE);
  };
}
