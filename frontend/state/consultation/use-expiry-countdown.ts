'use client';

import { useEffect, useState } from 'react';
import { formatCountdown } from '@/frontend/shared/consultation-time';

export interface ExpiryCountdown {
  remainingMs: number;
  label: string;
  expired: boolean;
}

const TICK_MS = 1000;

type Notify = () => void;

// One interval shared by every countdown on the page, so N cards never run N
// timers. Only the small ExpiryNotice component subscribes, so a tick
// re-renders the label rather than the whole booking card.
const subscribers = new Map<Notify, number>();
let interval: ReturnType<typeof setInterval> | null = null;

function stopInterval(): void {
  if (interval) clearInterval(interval);
  interval = null;
}

function syncInterval(): void {
  let hasPending = false;
  for (const target of subscribers.values()) {
    if (target > Date.now()) {
      hasPending = true;
      break;
    }
  }

  // Nobody has a live deadline left; the final tick already reported expiry.
  if (!hasPending) {
    stopInterval();
    return;
  }

  if (interval) return;
  interval = setInterval(() => {
    for (const notify of subscribers.keys()) notify();
    syncInterval();
  }, TICK_MS);
}

function subscribe(notify: Notify, target: number): () => void {
  subscribers.set(notify, target);
  syncInterval();
  return () => {
    subscribers.delete(notify);
    if (subscribers.size === 0) stopInterval();
  };
}

/** Live 1s countdown toward an ISO deadline, sharing one interval with every
 * other mounted countdown. `expired` flips once past the deadline. */
export function useExpiryCountdown(expiresAt: string | null | undefined): ExpiryCountdown {
  const target = expiresAt ? new Date(expiresAt).getTime() : null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (target === null) return;
    const notify = () => setNow(Date.now());
    notify();
    return subscribe(notify, target);
  }, [target]);

  const remainingMs = target === null ? 0 : Math.max(0, target - now);
  return {
    remainingMs,
    label: formatCountdown(remainingMs),
    expired: target === null ? false : remainingMs <= 0,
  };
}
