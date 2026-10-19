'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QuranLocalStore, isAyahRef } from '@/frontend/api/quran/local-store';
import { isIndexedDbSupported } from '@/frontend/shared/local-store/idb';
import { logger } from '@/frontend/shared/logger';
import type { Bookmark, ReadingPosition } from '@/shared/contracts/quran';

/**
 * A reader's own records, read from the Local Store (ADR-0056).
 *
 * Nothing here waits on the network or on a session: reading is anonymous, so
 * the store is opened as the guest and the reader's place is on the device. Sync
 * arrives with the session that Claims this store (P1b).
 */
export interface QuranReaderState {
  /** The store is open and the records below are the reader's own. */
  ready: boolean;
  readingPosition: ReadingPosition | null;
  bookmarks: Bookmark[];
  savePosition: (surah: number, ayah: number) => Promise<void>;
  toggleBookmark: (surah: number, ayah: number) => Promise<void>;
  removeBookmark: (clientId: string) => Promise<void>;
}

export function useQuranReader(): QuranReaderState {
  const [ready, setReady] = useState(false);
  const [readingPosition, setReadingPosition] = useState<ReadingPosition | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const storeRef = useRef<QuranLocalStore | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !isIndexedDbSupported()) return;

    let cancelled = false;
    let opened: QuranLocalStore | null = null;
    let unsubscribe: (() => void) | null = null;

    const readIntoState = async (store: QuranLocalStore) => {
      const [position, marks] = await Promise.all([
        store.getReadingPosition(),
        store.listBookmarks(),
      ]);
      if (cancelled) return;
      setReadingPosition(position);
      setBookmarks(marks);
    };

    QuranLocalStore.open()
      .then(async (store) => {
        opened = store;
        // The cleanup may already have run while the database was opening.
        if (cancelled) return store.close();

        storeRef.current = store;
        await readIntoState(store);
        if (cancelled) return;
        setReady(true);
        unsubscribe = store.subscribeWrites(() => {
          void readIntoState(store).catch(() => {});
        });
      })
      .catch((error) => {
        logger.error('Failed to open the Quran Local Store', { error: String(error) });
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
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
  }, []);

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

  return useMemo(
    () => ({ ready, readingPosition, bookmarks, savePosition, toggleBookmark, removeBookmark }),
    [ready, readingPosition, bookmarks, savePosition, toggleBookmark, removeBookmark]
  );
}
