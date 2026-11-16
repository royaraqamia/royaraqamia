'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import {
  backInFlight,
  entryBehind,
  markBackInFlight,
  noteNavigation,
  notePop,
  recordPathname,
} from './nav-history';

/**
 * Keeps the page load's history stack (see `nav-history.ts`) and makes walking
 * back into a page you came from a *back*, not a push.
 *
 * Mounted once by the root layout, so it sees every route — the back header
 * itself only exists on secondary pages and could not have observed the primary
 * ones the member passed through.
 *
 * The click listener is the big-brand rule the browser lacks: a tab bar returns
 * you to the screen you came from instead of stacking a second copy of it. Home
 * → Community → Home used to push three entries, and the back control then had
 * to walk A → B → A → B to get anywhere. Here the third click is a
 * `router.back()`, so the pair collapses to the one entry it always was.
 *
 * Every navigation is witnessed where it is written — the two History API
 * methods — so a programmatic `router.push` counts exactly like a `Link`, and
 * the note is what tells the next commit whether the entry is new.
 */
export function NavHistoryTracker() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    recordPathname(pathname);
  }, [pathname]);

  useEffect(() => {
    const onPopState = () => {
      notePop(window.location.pathname);
    };

    // Witness every navigation, including the programmatic ones no click can
    // see (`router.push` from a panel, a redirect). Next writes through the
    // History API, so wrapping its two writers is the one place that sees all.
    const push = window.history.pushState.bind(window.history);
    const replace = window.history.replaceState.bind(window.history);

    const pathOf = (url: string | URL | null | undefined): string => {
      if (url == null || url === '') return window.location.pathname;
      try {
        return new URL(String(url), window.location.href).pathname;
      } catch {
        return window.location.pathname;
      }
    };

    window.history.pushState = (data, unused, url) => {
      noteNavigation('push', pathOf(url));
      push(data, unused, url);
    };
    window.history.replaceState = (data, unused, url) => {
      noteNavigation('replace', pathOf(url));
      replace(data, unused, url);
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(target instanceof HTMLAnchorElement)) return;
      if (target.hasAttribute('download')) return;
      if (target.target !== '' && target.target !== '_self') return;

      let url: URL;
      try {
        url = new URL(target.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        // The page you are on: not a navigation, and not a history entry.
        return;
      }

      if (entryBehind() === url.pathname) {
        // Back to where we came from is the browser's own back button.
        event.preventDefault();
        event.stopImmediatePropagation();
        // A second tap before the first lands would pop the page after it.
        if (backInFlight()) return;

        markBackInFlight();
        notePop(url.pathname);
        router.back();
      }
    };

    document.addEventListener('popstate', onPopState);
    // Capture: a return-to-behind click has to be stopped before Next's own
    // click handler turns it into a push.
    document.addEventListener('click', onClick, true);

    return () => {
      document.removeEventListener('popstate', onPopState);
      document.removeEventListener('click', onClick, true);
      window.history.pushState = push;
      window.history.replaceState = replace;
    };
  }, [router]);

  return null;
}
