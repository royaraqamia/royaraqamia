'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useLinksnap, type LinksnapStoreState } from '@/frontend/state/linksnap/use-linksnap';
import type { LocalIdentity } from '@/frontend/shared/local-store/identity';

const LinksnapContext = createContext<LinksnapStoreState | null>(null);

/**
 * Shares one LinkSnap Local Store + Sync Engine with every consumer on the
 * page. The shortener and the account dashboard write to the same Outbox.
 *
 * The partition is a prop rather than a session read (#493): the caller resolves
 * it with `useLocalIdentity`, so the store opens on the first render instead of
 * after `getSession()`.
 */
export function LinksnapProvider({
  identity,
  children,
}: {
  identity: LocalIdentity;
  children: ReactNode;
}) {
  const state = useLinksnap({ identity });
  return <LinksnapContext.Provider value={state}>{children}</LinksnapContext.Provider>;
}

/** `null` when no provider is mounted (e.g. the admin console). */
export function useLinksnapContext(): LinksnapStoreState | null {
  return useContext(LinksnapContext);
}
