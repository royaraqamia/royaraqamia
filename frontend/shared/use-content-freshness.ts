'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  formatContentFreshness,
  readContentFreshness,
  recordContentFreshness,
} from '@/frontend/shared/content-freshness';

const FRESHNESS_TICK_MS = 60_000;

export interface ContentFreshness {
  /** Epoch ms of the last confirmed-fresh load of this route, or null. */
  lastFreshAt: number | null;
  /** True while the route is showing a cached copy (i.e. offline). */
  isStale: boolean;
  /** A relative "منذ …" label, or null when nothing was recorded. */
  label: string | null;
}

/**
 * Tracks how fresh the route currently on screen is. While online the content
 * has just been served/revalidated, so the moment is recorded; while offline we
 * read back the last recorded moment and let it age (a minute tick re-renders).
 */
export function useContentFreshness(isOnline: boolean): ContentFreshness {
  const pathname = usePathname();
  const [lastFreshAt, setLastFreshAt] = useState<number | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    // `isOnline` starts optimistic (true) for a hydration-safe default, so
    // cross-check the real signal before recording an offline load as fresh.
    const online = isOnline && (typeof navigator === 'undefined' || navigator.onLine);
    if (online) {
      const now = Date.now();
      recordContentFreshness(pathname, now);
      setLastFreshAt(now);
    } else {
      setLastFreshAt(readContentFreshness(pathname));
    }
  }, [pathname, isOnline]);

  useEffect(() => {
    if (isOnline) return;
    const id = window.setInterval(() => tick((value) => value + 1), FRESHNESS_TICK_MS);
    return () => window.clearInterval(id);
  }, [isOnline]);

  return {
    lastFreshAt,
    isStale: !isOnline,
    label: formatContentFreshness(lastFreshAt),
  };
}
