'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ShortenedLink } from '@/frontend/api/linksnap';
import {
  LinksnapLocalStore,
  linkStatus,
  type LinkCreateInput,
  type LinkRecord,
  type LinkUpdateInput,
} from '@/frontend/api/linksnap/local-store';
import { pullLinksnapData } from '@/frontend/api/linksnap/pull';
import { LinksnapSyncEngine } from '@/frontend/api/linksnap/sync-engine';
import { createLinksnapHttpSyncTransport } from '@/frontend/api/linksnap/sync-transport';
import { subscribeToSyncHints, userSyncHints } from '@/frontend/api/sync-hints';
import type { SyncEngine, SyncStatus } from '@/frontend/shared/local-store/sync-engine';
import {
  GUEST_IDENTITY,
  identityFromUser,
  identityUserId,
} from '@/frontend/shared/local-store/identity';
import { logger } from '@/frontend/shared/logger';
import { flushOutbox } from '@/frontend/shared/local-store/background-sync';
import { requestPersistentStorageOnce } from '@/frontend/shared/persistent-storage';
import { beginTap, markContent } from '@/frontend/shared/perf-marks';

/**
 * Tables whose changes mean this surface's data moved on another device
 * (ADR-0060). Published to Realtime by
 * `supabase/migrations/20261019120000_publish_owned_tables_for_realtime_hints.sql`.
 */
export const SYNC_HINT_TABLES = ['short_links'] as const;

export interface LinksnapStoreState {
  ready: boolean;
  loading: boolean;
  online: boolean;
  isSignedIn: boolean;
  store: LinksnapLocalStore | null;
  links: ShortenedLink[];
  syncing: boolean;
  pending: number;
  failed: number;
  lastError: string | null;
  lastFailedType: string | null;
  retry: () => void;
  refresh: () => Promise<void>;
  createLink: (input: LinkCreateInput) => Promise<ShortenedLink>;
  updateLink: (clientId: string, input: LinkUpdateInput) => Promise<ShortenedLink>;
  deleteLink: (clientId: string) => Promise<void>;
  restoreLink: (clientId: string) => Promise<ShortenedLink>;
}

const EMPTY_STATUS: SyncStatus = {
  syncing: false,
  pending: 0,
  failed: 0,
  lastError: null,
  lastFailedType: null,
};

function recordToLink(row: LinkRecord): ShortenedLink {
  return {
    clientId: row.clientId,
    code: row.code,
    originalUrl: row.originalUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isBlocked: row.isBlocked,
    expiresAt: row.expiresAt,
    status: linkStatus(row.isBlocked, row.expiresAt),
    passwordProtected: row.passwordProtected,
  };
}

/**
 * Opens the identity-scoped LinkSnap Local Store, seeds/merges it from the
 * server, then treats it as the source of truth the UI renders from. Writes go
 * to the store + Outbox; the Sync Engine replays them on reconnection (ADR-0027
 * / ADR-0029, ticket #167).
 */
export function useLinksnap({ user }: { user: { id: string } | null }): LinksnapStoreState {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<LinksnapLocalStore | null>(null);
  // Hydration-safe: the server (Node exposes a partial `navigator`) and the
  // first client render must agree, so start "online" and read the real value
  // in an effect.
  const [online, setOnline] = useState(true);
  const [links, setLinks] = useState<ShortenedLink[]>([]);
  const [status, setStatus] = useState<SyncStatus>(EMPTY_STATUS);

  const storeRef = useRef<LinksnapLocalStore | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);

  const identity = identityFromUser(user);
  const isSignedIn = identity !== GUEST_IDENTITY;

  const readIntoState = useCallback(async (store: LinksnapLocalStore) => {
    const rows = await store.getLinks();
    setLinks(rows.map(recordToLink));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    let opened: LinksnapLocalStore | null = null;
    let engine: SyncEngine | null = null;

    LinksnapLocalStore.open(identity)
      .then(async (store) => {
        opened = store;
        if (cancelled) return store.close();

        if (identity !== GUEST_IDENTITY) {
          const guest = await LinksnapLocalStore.open(GUEST_IDENTITY);
          try {
            await store.claimFrom(guest);
          } catch (error) {
            logger.error('Failed to claim guest LinkSnap data', { error: String(error) });
          } finally {
            guest.close();
          }
        }
        if (cancelled) return store.close();

        storeRef.current = store;
        await readIntoState(store);
        if (cancelled) return;
        setStore(store);
        setReady(true);
        // The launch's content mark: owned rows painted from the Local Store (#487).
        markContent();

        // A completed local write is itself a flush trigger while online, so a
        // change reaches the server promptly instead of waiting for a focus event.
        store.subscribeWrites(() => {
          requestPersistentStorageOnce();
          if (!cancelled) void readIntoState(store).catch(() => {});
          flushOutbox(engineRef.current);
        });

        engine = new LinksnapSyncEngine({
          store,
          transport: createLinksnapHttpSyncTransport(),
          isSignedIn: () => isSignedIn,
          onStatus: (next) => setStatus(next),
        });
        engineRef.current = engine;
        engine.onSync(() => {
          void readIntoState(store);
        });

        void engine.flush();
      })
      .catch((error) => {
        logger.error('Failed to open LinkSnap Local Store', { error: String(error) });
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      engine?.dispose();
      opened?.close();
      engineRef.current = null;
      storeRef.current = null;
      setStore(null);
    };
    // The identity change is the only trigger: reopening on every token refresh
    // would clobber local writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  /** Pulls the server's links and merges them into the store (background refresh). */
  const pull = useCallback(async () => {
    const store = storeRef.current;
    if (!store || !isSignedIn) {
      setLoading(false);
      return;
    }
    try {
      await pullLinksnapData(store);
    } catch (error) {
      logger.error('Failed to refresh LinkSnap links from the server', {
        error: String(error),
      });
    } finally {
      if (storeRef.current === store) setLoading(false);
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (!ready) return;
    void pull();
  }, [ready, pull]);

  useEffect(() => {
    if (!ready || !isSignedIn) return;
    const userId = identityUserId(identity);
    if (!userId) return;

    // Another device's write arrives as a hint and is answered by the same pull
    // the page runs on open, focus and reconnect (ADR-0060).
    return subscribeToSyncHints(userSyncHints(SYNC_HINT_TABLES, userId), () => void pull());
  }, [ready, isSignedIn, identity, pull]);

  useEffect(() => {
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);

    const onOnline = () => {
      setOnline(true);
      void engineRef.current?.flush();
      void pull();
    };
    const onOffline = () => setOnline(false);
    // Coming back to the page reconciles with the server as well as flushing: a
    // change made on another device while this tab was hidden is exactly what
    // the hint subscription could not deliver.
    const onWake = () => {
      void engineRef.current?.flush();
      void pull();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, [pull]);

  const refresh = useCallback(async () => {
    if (storeRef.current) await readIntoState(storeRef.current);
    await pull();
  }, [readIntoState, pull]);

  const retry = useCallback(() => {
    void engineRef.current?.retry();
  }, []);

  const createLink = useCallback(async (input: LinkCreateInput): Promise<ShortenedLink> => {
    const store = storeRef.current;
    if (!store) throw new Error('LinkSnap Local Store is not ready');
    // Tap → paint (#487): the write's subscriber repaints the list, so the frame
    // after the write settles is the one the user waited for.
    const painted = beginTap();
    try {
      return recordToLink(await store.createLink(input));
    } finally {
      painted();
    }
  }, []);

  const updateLink = useCallback(
    async (clientId: string, input: LinkUpdateInput): Promise<ShortenedLink> => {
      const store = storeRef.current;
      if (!store) throw new Error('LinkSnap Local Store is not ready');
      return recordToLink(await store.updateLink(clientId, input));
    },
    []
  );

  const deleteLink = useCallback(async (clientId: string): Promise<void> => {
    const store = storeRef.current;
    if (!store) throw new Error('LinkSnap Local Store is not ready');
    await store.deleteLink(clientId);
  }, []);

  const restoreLink = useCallback(async (clientId: string): Promise<ShortenedLink> => {
    const store = storeRef.current;
    if (!store) throw new Error('LinkSnap Local Store is not ready');
    return recordToLink(await store.restoreLink(clientId));
  }, []);

  return useMemo(
    () => ({
      ready,
      loading,
      online,
      isSignedIn,
      store,
      links,
      syncing: status.syncing,
      pending: status.pending,
      failed: status.failed,
      lastError: status.lastError,
      lastFailedType: status.lastFailedType,
      retry,
      refresh,
      createLink,
      updateLink,
      deleteLink,
      restoreLink,
    }),
    [
      ready,
      loading,
      online,
      isSignedIn,
      store,
      links,
      status,
      retry,
      refresh,
      createLink,
      updateLink,
      deleteLink,
      restoreLink,
    ]
  );
}
