'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

import { markInAppNavigation } from './nav-history';

/**
 * Counts in-app navigations for the current page load (see `nav-history.ts`).
 * Mounted once by the root layout, so the count covers every route — the back
 * header itself only exists on secondary pages, and could not have seen the
 * primary ones the user passed through.
 *
 * Idempotent under React's double-invoked effects: the first run records the
 * entry pathname and later runs compare against it rather than against a
 * "have I run before" flag.
 */
export function NavHistoryTracker() {
  const pathname = usePathname();
  const entryPathname = useRef<string | null>(null);

  useEffect(() => {
    if (entryPathname.current === null) {
      entryPathname.current = pathname;
      return;
    }
    if (entryPathname.current === pathname) return;
    markInAppNavigation();
  }, [pathname]);

  return null;
}
