'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BlogpressLocalStore, postFromDraft } from '@/frontend/api/blogpress/local-store';
import { BlogpressSyncEngine, type SyncStatus } from '@/frontend/api/blogpress/sync-engine';
import { createBlogpressHttpSyncTransport } from '@/frontend/api/blogpress/sync-transport';
import { pullBlogpressData } from '@/frontend/api/blogpress/pull';
import { subscribeToSyncHints, userSyncHints } from '@/frontend/api/sync-hints';
import {
  GUEST_IDENTITY,
  identityUserId,
  type LocalIdentity,
} from '@/frontend/shared/local-store/identity';
import {
  halveList,
  screenful,
  useSnapshot,
  useSnapshotRecorder,
} from '@/frontend/shared/local-store/snapshot';
import { logger } from '@/frontend/shared/logger';
import { flushOutbox } from '@/frontend/shared/local-store/background-sync';
import { requestPersistentStorageOnce } from '@/frontend/shared/persistent-storage';
import { markContent } from '@/frontend/shared/perf-marks';
import type { Post } from '@/shared/contracts/blogpress';

/**
 * The dashboard's Local Store and its pull (#449, ADR-0073).
 *
 * The root and the calendar are static shells now, so the list they render is
 * the store's drafts — the same records the editor writes — with the same pull
 * the editor and the background tier run (ADR-0060). Nothing seeds the store
 * from an RSC loader: #384's client pull is the only source of server data,
 * which is what makes an offline reload render the same posts.
 */

const SYNC_HINT_TABLES = ['posts'] as const;

interface DashboardSyncState extends SyncStatus {
  online: boolean;
  retry: () => void;
}

export interface BlogpressDashboardState {
  ready: boolean;
  posts: Post[];
  sync: DashboardSyncState;
  refresh: () => Promise<void>;
}

const IDLE: SyncStatus = {
  syncing: false,
  pending: 0,
  failed: 0,
  lastError: null,
  lastFailedType: null,
};

/** The surface's snapshot (#495): the posts the dashboard last painted. */
export const BLOGPRESS_SNAPSHOT_ROUTE = 'blogpress';

interface BlogpressSnapshot {
  posts: Post[];
}

/** The byte budget's second pass over the list. */
function trimBlogpress(data: BlogpressSnapshot): BlogpressSnapshot | null {
  const posts = halveList(data.posts);
  return posts.length === 0 ? null : { posts };
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

async function claimGuestData(userStore: BlogpressLocalStore): Promise<void> {
  const guest = await BlogpressLocalStore.open(GUEST_IDENTITY);
  try {
    await userStore.claimFrom(guest);
  } finally {
    guest.close();
  }
}

export function useBlogpressDashboard(identity: LocalIdentity): BlogpressDashboardState {
  /**
   * A guest draft has no author row. `postFromDraft` stamps whatever string it
   * is given, and a guest row is never pushed (the sync engine does not run for
   * `guest`), so the empty string is honest rather than a fake id.
   */
  const authorId = identityUserId(identity) ?? '';
  const isGuest = identity === GUEST_IDENTITY;
  /**
   * The identity the store read answered, or `null` before the first read.
   * Tagged rather than a boolean so an identity change cannot paint the previous
   * account's drafts while the new store opens.
   */
  const [readyFor, setReadyFor] = useState<LocalIdentity | null>(null);

  // The last screen this identity painted (#495), read during render.
  const snapshot = useSnapshot<BlogpressSnapshot>(identity, BLOGPRESS_SNAPSHOT_ROUTE);
  const [store, setStore] = useState<BlogpressLocalStore | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [status, setStatus] = useState<SyncStatus>(IDLE);
  const [online, setOnline] = useState(isOnline);
  const engineRef = useRef<BlogpressSyncEngine | null>(null);
  const ready = readyFor === identity;

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

  const readIntoState = useCallback(
    async (localStore: BlogpressLocalStore) => {
      const drafts = await localStore.getDrafts();
      setPosts(drafts.map((draft) => postFromDraft(draft, authorId)));
    },
    [authorId]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;
    let opened: BlogpressLocalStore | null = null;

    BlogpressLocalStore.open(identity)
      .then(async (localStore) => {
        opened = localStore;
        if (cancelled) return;
        // A guest claiming its own namespace would move rows onto themselves.
        if (!isGuest) {
          await claimGuestData(localStore).catch((error) => {
            logger.error('Failed to claim guest BlogPress data', { error: String(error) });
          });
          if (cancelled) return;
        }
        setStore(localStore);
        await readIntoState(localStore);
        if (cancelled) return;
        setReadyFor(identity);
        // The launch's content mark: owned rows painted from the Local Store (#487).
        markContent();

        if (!isGuest && isOnline()) {
          await pullBlogpressData(localStore)
            .then(() => readIntoState(localStore))
            .catch((error) => {
              logger.warn('BlogPress pull failed', { error: String(error) });
            });
        }
      })
      .catch((error) => {
        logger.error('Failed to open BlogPress Local Store', { error: String(error) });
      });

    return () => {
      cancelled = true;
      opened?.close();
    };
  }, [identity, isGuest, readIntoState]);

  useEffect(() => {
    if (!store || isGuest) return;

    const engine = new BlogpressSyncEngine({
      store,
      transport: createBlogpressHttpSyncTransport(store),
      isSignedIn: () => true,
    });
    engineRef.current = engine;

    const pull = async () => {
      if (!isOnline()) return;
      try {
        await pullBlogpressData(store);
        await readIntoState(store);
      } catch (error) {
        logger.warn('BlogPress pull failed', { error: String(error) });
      }
    };

    const runSync = async () => {
      await engine.flush();
      await pull();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void runSync();
    };

    window.addEventListener('online', runSync);
    window.addEventListener('focus', runSync);
    document.addEventListener('visibilitychange', onVisibility);
    engine.onSync(() => void pull());

    const stopHints = subscribeToSyncHints(
      userSyncHints(SYNC_HINT_TABLES, authorId, 'author_id'),
      () => void pull()
    );

    const unsubscribe = engine.subscribe(setStatus);
    const unsubscribeWrites = store.subscribeWrites(() => {
      requestPersistentStorageOnce();
      void readIntoState(store).catch(() => {});
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
  }, [store, authorId, isGuest, readIntoState]);

  const retry = useCallback(() => {
    void engineRef.current?.retry();
  }, []);

  const refresh = useCallback(async () => {
    if (store) await readIntoState(store);
  }, [store, readIntoState]);

  const recorded = useMemo(() => (ready ? { posts: screenful(posts) } : null), [ready, posts]);
  useSnapshotRecorder(identity, BLOGPRESS_SNAPSHOT_ROUTE, recorded, { trim: trimBlogpress });

  // The store's rows once it has answered, the last painted screen before that.
  // The empty list is the fallback rather than the state, which may belong to an
  // identity this one replaced.
  return {
    ready: ready || snapshot !== null,
    posts: ready ? posts : (snapshot?.posts ?? []),
    sync: { ...status, online, retry },
    refresh,
  };
}
