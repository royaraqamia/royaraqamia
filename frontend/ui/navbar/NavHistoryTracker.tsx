'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

import { recordPathname } from './nav-history';

/**
 * Counts in-app navigations for the current page load (see `nav-history.ts`).
 * Mounted once by the root layout, so the count covers every route — the back
 * header itself only exists on secondary pages, and could not have seen the
 * primary ones the user passed through.
 *
 * It also keeps the trail the back control reads, including the entry path, so
 * "is there a page of ours behind this one?" is answered from where the user
 * has actually been rather than from a counter that never comes back down.
 *
 * Idempotent under React's double-invoked effects: recording the same pathname
 * twice is a no-op.
 */
export function NavHistoryTracker() {
  const pathname = usePathname();

  useEffect(() => {
    recordPathname(pathname);
  }, [pathname]);

  return null;
}
