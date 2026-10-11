import { calculateTimeAgo } from '@/frontend/shared/format';

/**
 * Remembers when each public route was last served fresh (a network response),
 * so an offline, cache-served copy can show how old it is. This is a hint, not
 * data: it lives in `localStorage`, is best-effort, and a missing value simply
 * means "no freshness hint" rather than an error.
 */

const FRESHNESS_PREFIX = 'royaraqamia.contentFreshness:';

interface FreshnessStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStore(): FreshnessStore | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function contentFreshnessKey(pathname: string): string {
  return `${FRESHNESS_PREFIX}${pathname}`;
}

export function readContentFreshness(
  pathname: string,
  store: FreshnessStore | null = defaultStore()
): number | null {
  if (!store) return null;
  try {
    const raw = store.getItem(contentFreshnessKey(pathname));
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function recordContentFreshness(
  pathname: string,
  at: number,
  store: FreshnessStore | null = defaultStore()
): void {
  if (!store) return;
  try {
    store.setItem(contentFreshnessKey(pathname), String(at));
  } catch {
    // Private mode / quota exhausted: losing the hint is not worth an error.
  }
}

/** A relative "منذ …" label for a cached copy, or null when nothing is known. */
export function formatContentFreshness(lastFreshAt: number | null): string | null {
  if (lastFreshAt === null) return null;
  return calculateTimeAgo(new Date(lastFreshAt).toISOString());
}
