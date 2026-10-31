'use client';

import { useEffect } from 'react';

/**
 * Marks the Ayah the URL points at (P4).
 *
 * A search hit opens `/quran/N#ayah-M`, and the browser scrolls there on its own —
 * but a scroll alone leaves the reader guessing which of 286 Ayat is the one they
 * picked. Marking it is what makes the anchor mean something, and it survives the
 * scroll that follows because nothing removes it: unlike the playing Ayah's mark,
 * this is not a moving target but a decision the reader made.
 *
 * It runs on the client because the hash is not part of the request: the page is
 * static and prerendered, and every reader gets the same HTML.
 */
export function AyahAnchorHighlight() {
  useEffect(() => {
    const apply = () => {
      const match = /^#ayah-(\d+)$/.exec(window.location.hash);
      const number = match?.[1] ?? null;

      for (const element of document.querySelectorAll<HTMLElement>('[data-ayah]')) {
        if (number !== null && element.dataset.ayah === number) {
          element.setAttribute('data-ayah-target', 'true');
        } else {
          element.removeAttribute('data-ayah-target');
        }
      }
    };

    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, []);

  return null;
}
