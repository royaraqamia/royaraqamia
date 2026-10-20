'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QuranLocalStore, isAyahRef } from '@/frontend/api/quran/local-store';
import { pullQuranData } from '@/frontend/api/quran/pull';
import { createQuranHttpSyncTransport } from '@/frontend/api/quran/sync-transport';
import { QuranSyncEngine } from '@/frontend/api/quran/sync-engine';
import { subscribeToSyncHints, userSyncHints } from '@/frontend/api/sync-hints';
import { flushOutbox } from '@/frontend/shared/local-store/background-sync';
import { isIndexedDbSupported } from '@/frontend/shared/local-store/idb';
import {
  GUEST_IDENTITY,
  identityFromUser,
  identityUserId,
} from '@/frontend/shared/local-store/identity';
import type { SyncEngine, SyncStatus } from '@/frontend/shared/local-store/sync-engine';
import { requestPersistentStorageOnce } from '@/frontend/shared/persistent-storage';
import { logger } from '@/frontend/shared/logger';
import { useSession } from '@/frontend/state/session-provider';
import type { Bookmark, ReadingPosition } from '@/shared/contracts/quran';

/**
 * Tables whose changes mean the reader's records moved on another device
 * (ADR-0060). Published to Realtime by
 * `supabase/migrations/20261019170000_publish_quran_tables_for_realtime_hints.sql`.
 */
export const SYNC_HINT_TABLES = ['quran_reading_positions', 'quran_bookmarks'] as const;

/**
 * A reader's own records, read from the Local Store (ADR-0056).
 *
 * Reading is anonymous and stays that way: the store is opened for whoever is
 * reading — the guest, until a session arrives — and every read and write is
 * served from the device. Nothing below waits on the network or on a session, so
 * a reader who never signs in gets exactly the reader they had.
 *
 * A session buys one thing: sync. The account's store is opened instead of the
 * guest's, the guest's records are Claimed into it (ADR-0027), writes queue an
 * Outbox intent that the engine replays, and the reader subscribes to the two
 * tables so another device's write shows up here without a reload.
 */
export interface QuranReaderState {
  /** The store is open and the records below are the reader's own. */
  ready: boolean;
  /** A session is present, so the records below are backed by an account. */
  isSignedIn: boolean;
  online: boolean;
  readingPosition: ReadingPosition | null;
  bookmarks: Bookmark[];
  savePosition: (surah: number, ayah: number) => Promise<void>;
  toggleBookmark: (surah: number, ayah: number) => Promise<void>;
  removeBookmark: (clientId: string) => Promise<void>;
  /** Sync state, shaped for `SyncStatusPill` (ADR-0027). */
  syncing: boolean;
  pending: number;
  failed: number;
  lastError: string | null;
  lastFailedType: string | null;
  retry: () => void;
}

const EMPTY_STATUS: SyncStatus = {
  syncing: false,
  pending: 0,
  failed: 0,
  lastError: null,
  lastFailedType: null,
};

export function useQuranReader(): QuranReaderState {
  const { user } = useSession();
  const identity = identityFromUser(user);
  const isSignedIn = identity !== GUEST_IDENTITY;

  const [ready, setReady] = useState(false);
  const [readingPosition, setReadingPosition] = useState<ReadingPosition | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  // Hydration-safe: the server (Node exposes a partial `navigator`) and the
  // first client render must agree, so start "online" and read the real value in
  // an effect.
  const [online, setOnline] = useState(true);
  const [status, setStatus] = useState<SyncStatus>(EMPTY_STATUS);

  const storeRef = useRef<QuranLocalStore | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);

  const readIntoState = useCallback(async (store: QuranLocalStore) => {
    const [position, marks] = await Promise.all([
      store.getReadingPosition(),
      store.listBookmarks(),
    ]);
    setReadingPosition(position);
    setBookmarks(marks);
  }, []);

  /**
   * Reconciles the store with the server's incremental snapshot (LWW,
   * pending-aware), so a place or a mark made on another device lands here
   * instead of the two sides silently diverging — and so a write this device
   * made offline is not clobbered before it has been replayed. The store only
   * advances its cursor past records it actually applied (#313).
   *
   * Every wake-up path runs this — open, reconnect, focus and a Realtime hint —
   * so there is one reconciliation to reason about (ADR-0060).
   */
  const pullServer = useCallback(
    async (target: QuranLocalStore) => {
      if (!isSignedIn) return;
      try {
        await pullQuranData(target);
      } catch (error) {
        logger.error('Failed to reconcile the reader with the server', { error: String(error) });
      }
    },
    [isSignedIn]
  );

  /** Pulls from the server and repaints from the store. */
  const pull = useCallback(async () => {
    const target = storeRef.current;
    if (!target) return;
    await pullServer(target);
    await readIntoState(target);
  }, [pullServer, readIntoState]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isIndexedDbSupported()) return;

    let cancelled = false;
    let opened: QuranLocalStore | null = null;
    let engine: SyncEngine | null = null;
    let unsubscribe: (() => void) | null = null;

    QuranLocalStore.open(identity)
      .then(async (store) => {
        opened = store;
        // The cleanup may already have run while the database was opening.
        if (cancelled) return store.close();

        // Signing in Claims what the device already holds, so a reader who read
        // as a guest does not start over (ADR-0027).
        if (identity !== GUEST_IDENTITY) {
          const guest = await QuranLocalStore.open(GUEST_IDENTITY);
          try {
            await store.claimFrom(guest);
          } catch (error) {
            logger.error('Failed to claim guest Quran records', { error: String(error) });
          } finally {
            guest.close();
          }
        }
        if (cancelled) return store.close();

        // Reconcile with the server on every open, the same way a hint or a
        // wake-up does.
        await pullServer(store);
        if (cancelled) return store.close();

        storeRef.current = store;
        await readIntoState(store);
        if (cancelled) return;
        setReady(true);

        // A completed local write is itself a flush trigger while online, so a
        // mark or a place reaches the account promptly instead of waiting for a
        // focus event.
        unsubscribe = store.subscribeWrites(() => {
          requestPersistentStorageOnce();
          if (!cancelled) void readIntoState(store).catch(() => {});
          flushOutbox(engineRef.current);
        });

        engine = new QuranSyncEngine({
          store,
          transport: createQuranHttpSyncTransport(),
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
        logger.error('Failed to open the Quran Local Store', { error: String(error) });
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
      engine?.dispose();
      engineRef.current = null;
      setReady(false);

      // A session's cleanup flushes where the reader stopped through
      // `savePosition`, which reads `storeRef` — and React runs passive-effect
      // destroys in definition order. This hook is called before the effect that
      // owns that flush, so this cleanup ran first and used to clear the ref and
      // close the store out from under the flush: the last Ayah of every sura the
      // reader left was dropped, unless a tab hide had already persisted it
      // (#355).
      //
      // A microtask is enough to fix the order. The unmount pass is synchronous,
      // so the flush has already run — and started its transaction — by the time
      // this lands. `close()` then waits for that operation to settle before
      // closing for real (`LocalStoreConnection`), so the write is never yanked
      // and the connection is still closed by the end of the task.
      const store = opened;
      opened = null;
      queueMicrotask(() => {
        storeRef.current = null;
        store?.close();
      });
    };
    // The store is opened for one identity; a session arriving changes it, and
    // that is the only reason to reopen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

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

  /** Records where the reader is. Out-of-range refs are ignored, not thrown at. */
  const savePosition = useCallback(async (surah: number, ayah: number) => {
    const store = storeRef.current;
    if (!store || !isAyahRef(surah, ayah)) return;
    try {
      await store.saveReadingPosition(surah, ayah);
    } catch (error) {
      logger.error('Failed to save the reading position', { error: String(error) });
    }
  }, []);

  const toggleBookmark = useCallback(async (surah: number, ayah: number) => {
    const store = storeRef.current;
    if (!store || !isAyahRef(surah, ayah)) return;
    try {
      await store.toggleBookmark(surah, ayah);
    } catch (error) {
      logger.error('Failed to toggle a bookmark', { error: String(error) });
    }
  }, []);

  const removeBookmark = useCallback(async (clientId: string) => {
    const store = storeRef.current;
    if (!store) return;
    try {
      await store.removeBookmark(clientId);
    } catch (error) {
      logger.error('Failed to remove a bookmark', { error: String(error) });
    }
  }, []);

  const retry = useCallback(() => {
    void engineRef.current?.retry();
  }, []);

  return useMemo(
    () => ({
      ready,
      isSignedIn,
      online,
      readingPosition,
      bookmarks,
      savePosition,
      toggleBookmark,
      removeBookmark,
      syncing: status.syncing,
      pending: status.pending,
      failed: status.failed,
      lastError: status.lastError,
      lastFailedType: status.lastFailedType,
      retry,
    }),
    [
      ready,
      isSignedIn,
      online,
      readingPosition,
      bookmarks,
      savePosition,
      toggleBookmark,
      removeBookmark,
      status,
      retry,
    ]
  );
}
