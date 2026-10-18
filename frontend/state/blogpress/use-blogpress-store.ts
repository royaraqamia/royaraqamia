'use client';

import { useEffect, useRef, useState } from 'react';
import type { Post } from '@/shared/contracts/blogpress';
import { BlogpressLocalStore, type BlogpressDraft } from '@/frontend/api/blogpress/local-store';
import { BlogpressSyncEngine, type SyncStatus } from '@/frontend/api/blogpress/sync-engine';
import { createBlogpressHttpSyncTransport } from '@/frontend/api/blogpress/sync-transport';
import {
  GUEST_IDENTITY,
  userIdentity,
  type LocalIdentity,
} from '@/frontend/shared/local-store/identity';
import { logger } from '@/frontend/shared/logger';
import { requestPersistentStorageOnce } from '@/frontend/shared/persistent-storage';

export interface BlogpressSyncState extends SyncStatus {
  /** Whether the browser currently reports a connection (drives the pill/gate). */
  online: boolean;
  retry: () => void;
}

export interface BlogpressStoreState {
  store: BlogpressLocalStore | null;
  ready: boolean;
  draft: BlogpressDraft | null;
  sync: BlogpressSyncState;
}

const IDLE: SyncStatus = {
  syncing: false,
  pending: 0,
  failed: 0,
  lastError: null,
  lastFailedType: null,
};

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/**
 * Moves anything a guest wrote before signing in into the account store
 * (ADR-0027): dedupe by id, LWW, and the guest intents are re-homed so the work
 * syncs under the account. Idempotent — an emptied guest store is a no-op.
 */
async function claimGuestData(userStore: BlogpressLocalStore): Promise<void> {
  const guest = await BlogpressLocalStore.open(GUEST_IDENTITY);
  try {
    await userStore.claimFrom(guest);
  } finally {
    guest.close();
  }
}

/**
 * Owns the editor's Local Store and its Sync Engine (ADR-0028/0029). The server
 * loader's post is only a seed: it fills an empty store once, after which the
 * store is authoritative and renders the editor. Flushes ride `online`, focus
 * and visibility; other tabs converge over BroadcastChannel.
 */
export function useBlogpressStore(post: Post, userId: string): BlogpressStoreState {
  const identity: LocalIdentity = userIdentity(userId);
  const [store, setStore] = useState<BlogpressLocalStore | null>(null);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<BlogpressDraft | null>(null);
  const [status, setStatus] = useState<SyncStatus>(IDLE);
  const [online, setOnline] = useState(isOnline);
  const engineRef = useRef<BlogpressSyncEngine | null>(null);

  useEffect(() => {
    const sync = () => setOnline(isOnline());
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;
    let opened: BlogpressLocalStore | null = null;

    BlogpressLocalStore.open(identity)
      .then(async (localStore) => {
        opened = localStore;
        if (cancelled) return;
        await claimGuestData(localStore).catch((error) => {
          logger.error('Failed to claim guest BlogPress data', { error: String(error) });
        });
        if (cancelled) return;
        await localStore.seedIfEmpty([post]);
        const localDraft = await localStore.getDraft(post.id);
        if (cancelled) return;
        setStore(localStore);
        setDraft(localDraft);
        setReady(true);
      })
      .catch((error) => {
        logger.error('Failed to open BlogPress Local Store', { error: String(error) });
      });

    return () => {
      cancelled = true;
      opened?.close();
    };
  }, [identity, post]);

  useEffect(() => {
    if (!store) return;

    const engine = new BlogpressSyncEngine({
      store,
      transport: createBlogpressHttpSyncTransport(store),
      isSignedIn: () => true,
    });
    engineRef.current = engine;

    const runSync = () => void engine.flush();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') runSync();
    };

    window.addEventListener('online', runSync);
    window.addEventListener('focus', runSync);
    document.addEventListener('visibilitychange', onVisibility);
    engine.onSync(runSync);

    const unsubscribe = engine.subscribe((next) => {
      setStatus(next);
      void store.getDraft(post.id).then(setDraft);
    });
    // A completed local save is itself a flush trigger while online, so an edit
    // reaches the server promptly instead of waiting for the next focus event.
    const unsubscribeWrites = store.subscribeWrites(() => {
      requestPersistentStorageOnce();
      void engine.flush();
    });
    void runSync();

    return () => {
      unsubscribe();
      unsubscribeWrites();
      window.removeEventListener('online', runSync);
      window.removeEventListener('focus', runSync);
      document.removeEventListener('visibilitychange', onVisibility);
      engine.dispose();
      engineRef.current = null;
    };
  }, [store, post.id]);

  const retry = () => {
    void engineRef.current?.retry();
  };

  return { store, ready, draft, sync: { ...status, online, retry } };
}
