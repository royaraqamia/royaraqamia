'use client';

import { useEffect } from 'react';

import { touchLastSeen } from '@/frontend/api/presence';
import { useSession } from '@/frontend/state/session-provider';

/** Twice a minute while the member is actually looking at the app (ADR 0212). */
const HEARTBEAT_MS = 30_000;

/**
 * The one writer of the caller's last seen. Mounted once in the shell, so a
 * member who is reading any page is marked present — not only one with a chat
 * open. A hidden tab writes nothing, and a failed write is swallowed: presence
 * is cosmetic and must never interrupt what the member was doing.
 */
export function LastSeenHeartbeat() {
  const { user } = useSession();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId || typeof document === 'undefined') return;

    let timer: ReturnType<typeof setInterval> | null = null;
    let lastStamp = 0;

    const stamp = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      // Mount and focus can fire together; one stamp is enough for both.
      if (now - lastStamp < HEARTBEAT_MS - 1_000) return;
      lastStamp = now;
      void touchLastSeen().catch(() => undefined);
    };

    const start = () => {
      if (timer !== null) return;
      stamp();
      timer = setInterval(stamp, HEARTBEAT_MS);
    };

    const stop = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', stamp);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', stamp);
    };
  }, [userId]);

  return null;
}
