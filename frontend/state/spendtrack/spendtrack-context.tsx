'use client';

import { createContext, useContext, type ReactNode } from 'react';
import {
  useSpendtrack,
  type SpendtrackSeed,
  type SpendtrackStoreState,
} from '@/frontend/state/spendtrack/use-spendtrack';

const SpendtrackContext = createContext<SpendtrackStoreState | null>(null);

/**
 * Shares one SpendTrack Local Store + Sync Engine with every consumer on the
 * page. Writes made anywhere under it queue in the same Outbox.
 */
export function SpendtrackProvider({
  seed,
  children,
}: {
  seed: SpendtrackSeed;
  children: ReactNode;
}) {
  const state = useSpendtrack(seed);
  return <SpendtrackContext.Provider value={state}>{children}</SpendtrackContext.Provider>;
}

/** `null` when no provider is mounted (e.g. the online-only server sections). */
export function useSpendtrackContext(): SpendtrackStoreState | null {
  return useContext(SpendtrackContext);
}
