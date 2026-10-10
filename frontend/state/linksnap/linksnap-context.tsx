'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useLinksnap, type LinksnapStoreState } from '@/frontend/state/linksnap/use-linksnap';

const LinksnapContext = createContext<LinksnapStoreState | null>(null);

/**
 * Shares one LinkSnap Local Store + Sync Engine with every consumer on the
 * page. The shortener and the account dashboard write to the same Outbox.
 */
export function LinksnapProvider({
  token,
  user,
  children,
}: {
  token: string | null;
  user: { id: string } | null;
  children: ReactNode;
}) {
  const state = useLinksnap({ token, user });
  return <LinksnapContext.Provider value={state}>{children}</LinksnapContext.Provider>;
}

/** `null` when no provider is mounted (e.g. the admin console). */
export function useLinksnapContext(): LinksnapStoreState | null {
  return useContext(LinksnapContext);
}
