'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { subscribeToNewsDigestChanges } from '@/frontend/api/news';

/** Folds a burst of changes (a re-run deletes and re-inserts) into one refresh. */
const REFRESH_DEBOUNCE_MS = 1200;

interface NewsLiveRefreshProps {
  /**
   * Server-formatted, so the pill cannot disagree with the HTML it hydrates:
   * an Intl call in the browser may not match the server's locale data.
   */
  lastPublishedLabel: string | null;
}

/**
 * Turns a published digest into a visible one without a reload.
 *
 * The subscription is the same `postgres_changes` signal the products use for
 * sync hints (ADR-0060), pointed at a public table: `news_digests` is in the
 * `supabase_realtime` publication (20261023130100) and its RLS read policy is
 * `true`, so the payload carries nothing a visitor could not fetch anyway. A
 * channel that cannot open costs freshness, never the page — the next navigation
 * or focus still reads the server.
 */
export function NewsLiveRefresh({ lastPublishedLabel }: NewsLiveRefreshProps) {
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

  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-bold text-emerald-700 dark:text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
        تحديث مباشر
      </span>
      {lastPublishedLabel ? <span>آخر إصدار: {lastPublishedLabel}</span> : null}
    </div>
  );
}
