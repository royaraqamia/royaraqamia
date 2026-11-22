'use client';

import { useEffect } from 'react';

/** One list read every 30 seconds, and one more when the tab comes back (ADR 0212). */
const REFRESH_MS = 30_000;

/**
 * Keeps a surface's own data fresh enough for the derived presence dot. The
 * caller's `refresh` is used as-is: the Chats list already hydrates each
 * counterpart's `lastSeenAt`, so one request serves every visible row.
 */
export function usePresenceRefresh(refresh: () => Promise<void>, active = true): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const poll = () => {
      if (document.visibilityState !== 'visible') return;
      void refresh().catch(() => undefined);
    };
    const start = () => {
      if (timer !== null) return;
      // The surface's own first read already filled the rows; do not duplicate
      // it here, only keep it fresh afterwards.
      timer = setInterval(poll, REFRESH_MS);
    };
    const stop = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        poll();
        start();
      } else {
        stop();
      }
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh, active]);
}
