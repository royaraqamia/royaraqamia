'use client';

import { useEffect, useState } from 'react';
import { formatCountdown } from '@/frontend/shared/consultation-time';

export interface ExpiryCountdown {
  remainingMs: number;
  label: string;
  expired: boolean;
}

const TICK_MS = 1000;

/** Live 1s countdown toward an ISO deadline; `expired` flips exactly once past it. */
export function useExpiryCountdown(expiresAt: string | null | undefined): ExpiryCountdown {
  const [remainingMs, setRemainingMs] = useState(() =>
    expiresAt ? Math.max(0, new Date(expiresAt).getTime() - Date.now()) : 0
  );

  useEffect(() => {
    if (!expiresAt) return;

    const target = new Date(expiresAt).getTime();
    const update = () => setRemainingMs(Math.max(0, target - Date.now()));
    update();

    const interval = setInterval(update, TICK_MS);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return {
    remainingMs,
    label: formatCountdown(remainingMs),
    expired: expiresAt ? remainingMs <= 0 : false,
  };
}
