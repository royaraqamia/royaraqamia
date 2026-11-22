'use client';

import { useEffect, useState } from 'react';

import { getChatPresence } from '@/frontend/api/chats';

/** One read every 30 seconds, and one more when the member comes back (ADR 0212). */
const POLL_MS = 30_000;

/**
 * The peer's fresh last seen for one open direct thread.
 *
 * The thread response already carries a stamp, but a header that only read it
 * once would keep saying «متصل الآن» long after the peer left. A full thread
 * refresh is not a substitute: it stamps *our own* read watermark on the way,
 * so this asks the narrow presence endpoint instead.
 */
export function usePeerLastSeen(
  conversationId: string,
  initial: string | null | undefined,
  active = true
): string | null {
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(initial ?? null);

  useEffect(() => {
    setLastSeenAt(initial ?? null);
  }, [initial, conversationId]);

  useEffect(() => {
    if (!active || !conversationId || typeof document === 'undefined') return;

    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = () => {
      if (document.visibilityState !== 'visible') return;
      void getChatPresence(conversationId)
        .then((stamp) => {
          if (alive) setLastSeenAt(stamp);
        })
        .catch(() => undefined);
    };

    const start = () => {
      if (timer !== null) return;
      // The thread response already carried the first stamp; only the ticking
      // refresh and a return to the tab need a new read.
      timer = setInterval(poll, POLL_MS);
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
      alive = false;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [conversationId, active]);

  return lastSeenAt;
}
