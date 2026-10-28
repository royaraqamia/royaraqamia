'use client';

import { useCallback, useEffect, useState } from 'react';

import type { AthkarPeriod } from '@/shared/contracts/athkar';
import {
  clearOne,
  dayKey,
  emptyCounts,
  increment as incrementCount,
  nextMidnightDelay,
  readCounts,
  writeCounts,
  type AthkarCounts,
} from './count-store';

/**
 * Today's count, read on the device and written back after every tap.
 *
 * The page is prerendered, so the first render must not know the visitor's
 * `localStorage`. It starts from an empty day and adopts the stored one in an
 * effect; `ready` is what the cards use to withhold the number until it is
 * really theirs, so nobody sees a truthful-looking «0» a frame before their
 * saved 47 arrives.
 *
 * A timer set for the next local midnight re-reads the store, which is what
 * makes a tab left open overnight start the new day empty — the same trick
 * `HijriToday` uses for the date it shows.
 */
export function useAthkarCounts() {
  const [counts, setCounts] = useState<AthkarCounts>(() => emptyCounts(dayKey()));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let timer = 0;

    const load = () => {
      setCounts(readCounts(dayKey()));
      setReady(true);

      window.clearTimeout(timer);
      timer = window.setTimeout(load, nextMidnightDelay());
    };

    load();
    return () => window.clearTimeout(timer);
  }, []);

  // Persisting in an effect keeps the updaters pure, which StrictMode's
  // double-invocation depends on.
  useEffect(() => {
    if (ready) writeCounts(counts);
  }, [counts, ready]);

  const increment = useCallback((period: AthkarPeriod, id: string, target: number) => {
    setCounts((current) => incrementCount(current, period, id, target));
  }, []);

  const reset = useCallback((period: AthkarPeriod, id: string) => {
    setCounts((current) => clearOne(current, period, id));
  }, []);

  return { counts, ready, increment, reset };
}
