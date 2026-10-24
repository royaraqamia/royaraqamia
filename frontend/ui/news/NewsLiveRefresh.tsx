'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { subscribeToNewsDigestChanges } from '@/frontend/api/news';

/** Folds a burst of changes (a re-run deletes and re-inserts) into one refresh. */
const REFRESH_DEBOUNCE_MS = 1200;

/**
 * Turns a published digest into a visible one without a reload.
 *
 * Renders nothing: the page shows no freshness indicator, but the subscription
 * is kept so a digest that lands while someone is reading still appears.
 *
 * The subscription is the same `postgres_changes` signal the products use for
 * sync hints (ADR-0060), pointed at a public table: `news_digests` is in the
 * `supabase_realtime` publication (20261023130100) and its RLS read policy is
 * `true`, so the payload carries nothing a visitor could not fetch anyway. A
 * channel that cannot open costs freshness, never the page — the next navigation
 * or focus still reads the server.
 */
export function NewsLiveRefresh(): null {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), REFRESH_DEBOUNCE_MS);
    };

    const stop = subscribeToNewsDigestChanges({
      onInsert: refresh,
      onUpdate: refresh,
      onDelete: refresh,
    });

    // A digest published while the tab was hidden arrives as no event the page
    // saw; coming back to the tab is the cheapest place to catch up.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (timer) clearTimeout(timer);
    };
  }, [router]);

  return null;
}
