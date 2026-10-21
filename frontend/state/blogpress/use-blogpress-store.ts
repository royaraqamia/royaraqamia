'use client';

import { useEffect, useRef, useState } from 'react';
import type { Post } from '@/shared/contracts/blogpress';
import { BlogpressLocalStore, type BlogpressDraft } from '@/frontend/api/blogpress/local-store';
import { BlogpressSyncEngine, type SyncStatus } from '@/frontend/api/blogpress/sync-engine';
import { createBlogpressHttpSyncTransport } from '@/frontend/api/blogpress/sync-transport';
import { pullBlogpressData } from '@/frontend/api/blogpress/pull';
import { subscribeToSyncHints, userSyncHints } from '@/frontend/api/sync-hints';
import {
  GUEST_IDENTITY,
  userIdentity,
  type LocalIdentity,
} from '@/frontend/shared/local-store/identity';
import { logger } from '@/frontend/shared/logger';
import { flushOutbox } from '@/frontend/shared/local-store/background-sync';
import { requestPersistentStorageOnce } from '@/frontend/shared/persistent-storage';

/**
 * The table whose change means this account's posts moved on another device
 * (ADR-0060). Published to Realtime by
 * `supabase/migrations/20261021120000_publish_blogpress_posts_for_realtime_hints.sql`.
 * Posts key ownership on `author_id`, not `user_id`.
 */
export const SYNC_HINT_TABLES = ['posts'] as const;

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
 * store is authoritative and renders the editor. A sync ride is flush + pull:
 * flushes to the server, then a reconcile-pull against it (ADR-0060), on
 * `online`, focus and visibility; a Realtime hint answers with the same pull;
 * other tabs converge over BroadcastChannel.
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
        // Reconcile with the server on every open, the same way a hint or a
        // focus runs it (ADR-0060). A failed pull must not block the editor,
        // and it is never lost: the store is authoritative until one lands.
        if (isOnline()) {
          await pullBlogpressData(localStore).catch((error) => {
            logger.warn('BlogPress pull failed', { error: String(error) });
          });
        }
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

    const pull = async () => {
      if (!isOnline()) return;
      try {
        // The same pull the background tier runs (ADR-0060): this hook owns
        // *when*, `pullBlogpressData` owns *how*.
        await pullBlogpressData(store);
        setDraft(await store.getDraft(post.id));
      } catch (error) {
        logger.warn('BlogPress pull failed', { error: String(error) });
      }
    };

    const runSync = async () => {
      await engine.flush();
      await pull();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') runSync();
    };

    window.addEventListener('online', runSync);
    window.addEventListener('focus', runSync);
    document.addEventListener('visibilitychange', onVisibility);
    // A delivered flush is this device learning the server's newest state for
    // *its own* write; the pull that follows is what converges siblings' rows.
    engine.onSync(() => void pull());

    // Another device's write arrives as a hint, and a hint is answered by the
    // same pull this effect runs on focus and reconnect (ADR-0060). Posts key
    // ownership on `author_id`, not `user_id`.
    const stopHints = subscribeToSyncHints(
      userSyncHints(SYNC_HINT_TABLES, userId, 'author_id'),
      () => void pull()
    );

    const unsubscribe = engine.subscribe((next) => {
      setStatus(next);
      void store.getDraft(post.id).then(setDraft);
    });
    // A completed local save is itself a flush trigger while online, so an edit
    // reaches the server promptly instead of waiting for the next focus event.
    const unsubscribeWrites = store.subscribeWrites(() => {
      requestPersistentStorageOnce();
      flushOutbox(engine);
    });
    void runSync();

    return () => {
      unsubscribe();
      unsubscribeWrites();
      stopHints();
      window.removeEventListener('online', runSync);
      window.removeEventListener('focus', runSync);
      document.removeEventListener('visibilitychange', onVisibility);
      engine.dispose();
      engineRef.current = null;
    };
  }, [store, post.id, userId]);

  const retry = () => {
    void engineRef.current?.retry();
  };

  return { store, ready, draft, sync: { ...status, online, retry } };
}
