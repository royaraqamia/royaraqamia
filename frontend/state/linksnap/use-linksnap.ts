'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listLinks, type ShortenedLink } from '@/frontend/api/linksnap';
import {
  LinksnapLocalStore,
  linkStatus,
  type LinkCreateInput,
  type LinkRecord,
  type LinkUpdateInput,
} from '@/frontend/api/linksnap/local-store';
import { createLinksnapHttpSyncTransport } from '@/frontend/api/linksnap/sync-transport';
import { SyncEngine, type SyncStatus } from '@/frontend/shared/local-store/sync-engine';
import { GUEST_IDENTITY, identityFromUser } from '@/frontend/shared/local-store/identity';
import { logger } from '@/frontend/shared/logger';

const LINKSNAP_SYNC_LOCK = 'linksnap-sync';
const LINKSNAP_SYNC_CHANNEL = 'linksnap-sync';
const SYNCED_MESSAGE = 'linksnap:synced';

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
  retry: () => void;
  refresh: () => Promise<void>;
  createLink: (input: LinkCreateInput) => Promise<ShortenedLink>;
  updateLink: (clientId: string, input: LinkUpdateInput) => Promise<ShortenedLink>;
  deleteLink: (clientId: string) => Promise<void>;
  restoreLink: (clientId: string) => Promise<ShortenedLink>;
}

const EMPTY_STATUS: SyncStatus = { syncing: false, pending: 0, failed: 0, lastError: null };

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

function serverToRecord(link: ShortenedLink): LinkRecord {
  return {
    clientId: link.clientId ?? link.code,
    code: link.code,
    originalUrl: link.originalUrl,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt ?? link.createdAt,
    expiresAt: link.expiresAt,
    isBlocked: link.isBlocked,
    passwordProtected: Boolean(link.passwordProtected),
    deletedAt: link.deletedAt ?? null,
  };
}

/**
 * Opens the identity-scoped LinkSnap Local Store, seeds/merges it from the
 * server, then treats it as the source of truth the UI renders from. Writes go
 * to the store + Outbox; the Sync Engine replays them on reconnection (ADR-0027
 * / ADR-0029, ticket #167).
 */
export function useLinksnap({
  token,
  user,
}: {
  token: string | null;
  user: { id: string } | null;
}): LinksnapStoreState {
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
  const tokenRef = useRef(token);
  tokenRef.current = token;

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
    let channel: BroadcastChannel | null = null;

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

        store.subscribeWrites(() => {
          if (!cancelled) void readIntoState(store).catch(() => {});
        });

        engine = new SyncEngine(
          {
            store,
            transport: createLinksnapHttpSyncTransport(() => tokenRef.current),
            isSignedIn: () => isSignedIn,
            onStatus: (next) => setStatus(next),
            broadcast: (message) => channel?.postMessage(message),
          },
          {
            lockName: LINKSNAP_SYNC_LOCK,
            channelName: LINKSNAP_SYNC_CHANNEL,
            logLabel: 'LinkSnap',
            syncedMessage: SYNCED_MESSAGE,
          }
        );
        engineRef.current = engine;

        if (typeof BroadcastChannel !== 'undefined') {
          channel = new BroadcastChannel(LINKSNAP_SYNC_CHANNEL);
          channel.onmessage = () => {
            void readIntoState(store);
          };
        }

        void engine.flush();
      })
      .catch((error) => {
        logger.error('Failed to open LinkSnap Local Store', { error: String(error) });
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      channel?.close();
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
    if (!store || !isSignedIn || !token) {
      setLoading(false);
      return;
    }
    try {
      const server = await listLinks(token);
      await store.mergeServerData(server.map(serverToRecord));
    } catch (error) {
      logger.error('Failed to refresh LinkSnap links from the server', {
        error: String(error),
      });
    } finally {
      if (storeRef.current === store) setLoading(false);
    }
  }, [isSignedIn, token]);

  useEffect(() => {
    if (!ready) return;
    void pull();
  }, [ready, pull]);

  useEffect(() => {
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);

    const onOnline = () => {
      setOnline(true);
      void engineRef.current?.flush();
      void pull();
    };
    const onOffline = () => setOnline(false);
    const onWake = () => void engineRef.current?.flush();

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
    return recordToLink(await store.createLink(input));
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
