import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Note } from '@/shared/contracts/notes';
import { NotesLocalStore } from '@/frontend/api/notes/local-store';
import { pullNotesData } from '@/frontend/api/notes/pull';
import { createNotesHttpSyncTransport } from '@/frontend/api/notes/sync-transport';
import { NotesSyncEngine } from '@/frontend/api/notes/sync-engine';
import type { SyncStatus } from '@/frontend/shared/local-store/sync-engine';
import { subscribeToSyncHints, userSyncHints } from '@/frontend/api/sync-hints';
import {
  GUEST_IDENTITY,
  identityUserId,
  type LocalIdentity,
} from '@/frontend/shared/local-store/identity';
import { logger } from '@/frontend/shared/logger';
import { flushOutbox } from '@/frontend/shared/local-store/background-sync';
import { requestPersistentStorageOnce } from '@/frontend/shared/persistent-storage';
import { markContent } from '@/frontend/shared/perf-marks';
import { useLocalIdentity } from '@/frontend/state/use-local-identity';

/**
 * Tables whose changes mean these notes moved on another device (ADR-0060).
 * Published to Realtime by
 * `supabase/migrations/20261028120100_publish_notes_for_realtime_hints.sql`.
 */
export const SYNC_HINT_TABLES = ['notes'] as const;

export interface NotesStoreState {
  /** The store answered: writes and the sync engine are available. */
  ready: boolean;
  online: boolean;
  isSignedIn: boolean;
  store: NotesLocalStore | null;
  notes: Note[];
  syncing: boolean;
  pending: number;
  failed: number;
  lastError: string | null;
  lastFailedType: string | null;
  retry: () => void;
  refresh: () => Promise<void>;
}

const EMPTY_STATUS: SyncStatus = {
  syncing: false,
  pending: 0,
  failed: 0,
  lastError: null,
  lastFailedType: null,
};

/**
 * Opens the identity-scoped Notes Local Store and treats it as the source of
 * truth the UI renders from. Writes go to the store + Outbox; the Sync Engine
 * replays them on reconnection, and the pull reconciles what other devices wrote.
 *
 * No server loader seeds it: a note only ever comes from the device or from the
 * pull, so there is one path to keep in step (ADR-0073, ADR-0092).
 */
export function useNotes(): NotesStoreState {
  /**
   * The identity the store read answered, or `null` before the first read.
   * Tagged rather than a boolean so an identity change cannot paint the previous
   * account's notes while the new store opens.
   */
  const [readyFor, setReadyFor] = useState<LocalIdentity | null>(null);
  const [store, setStore] = useState<NotesLocalStore | null>(null);
  // Hydration-safe: the server (Node exposes a partial `navigator`) and the
  // first client render must agree, so start "online" and read the real value
  // in an effect.
  const [online, setOnline] = useState(true);
  const [notes, setNotes] = useState<Note[]>([]);
  const [status, setStatus] = useState<SyncStatus>(EMPTY_STATUS);

  const storeRef = useRef<NotesLocalStore | null>(null);
  const engineRef = useRef<NotesSyncEngine | null>(null);

  const { identity, isLoading } = useLocalIdentity();
  const isSignedIn = identity !== GUEST_IDENTITY;
  const ready = readyFor === identity;

  const readIntoState = useCallback(async (target: NotesLocalStore) => {
    setNotes(await target.getNotes());
  }, []);

  /**
   * Reconciles the store with the server's incremental snapshot (LWW,
   * pending-aware), including tombstones, so edits and deletes made on another
   * device land here instead of the store silently diverging. Guests own no
   * server rows, so they do not pull.
   *
   * Every wake-up path runs this — open, reconnect, focus and a Realtime hint —
   * so there is one reconciliation to reason about (ADR-0060).
   */
  const pullServer = useCallback(
    async (target: NotesLocalStore) => {
      if (!isSignedIn) return;
      try {
        await pullNotesData(target);
      } catch (error) {
        logger.error('Failed to reconcile notes with the server', { error: String(error) });
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
    if (typeof window === 'undefined') return;
    let cancelled = false;
    let opened: NotesLocalStore | null = null;
    let engine: NotesSyncEngine | null = null;

    NotesLocalStore.open(identity)
      .then(async (next) => {
        opened = next;
        if (cancelled) return next.close();

        if (identity !== GUEST_IDENTITY) {
          const guest = await NotesLocalStore.open(GUEST_IDENTITY);
          try {
            await next.claimFrom(guest);
          } catch (error) {
            logger.error('Failed to claim guest notes', { error: String(error) });
          } finally {
            guest.close();
          }
        }
        if (cancelled) return next.close();

        await pullServer(next);
        if (cancelled) return next.close();

        storeRef.current = next;
        await readIntoState(next);
        if (cancelled) return;
        setStore(next);
        setReadyFor(identity);
        // The launch's content mark: owned rows painted from the Local Store (#487).
        markContent();

        // A completed local write is itself a flush trigger while online, so a
        // change reaches the server promptly instead of waiting for a focus event.
        next.subscribeWrites(() => {
          requestPersistentStorageOnce();
          if (!cancelled) void readIntoState(next).catch(() => {});
          flushOutbox(engineRef.current);
        });

        engine = new NotesSyncEngine({
          store: next,
          transport: createNotesHttpSyncTransport(),
          isSignedIn: () => isSignedIn,
          onStatus: (syncStatus) => setStatus(syncStatus),
        });
        engineRef.current = engine;
        engine.onSync(() => {
          void readIntoState(next);
        });

        void engine.flush();
      })
      .catch((error) => {
        logger.error('Failed to open Notes Local Store', { error: String(error) });
      });

    return () => {
      cancelled = true;
      engine?.dispose();
      opened?.close();
      engineRef.current = null;
      storeRef.current = null;
      setStore(null);
    };
    // Identity change is the only trigger: the store opens once for it, and
    // re-opening on anything else would race the rows it is already painting.
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
    if (isLoading) return;
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
  }, [isLoading, pull]);

  const refresh = useCallback(async () => {
    if (storeRef.current) await readIntoState(storeRef.current);
  }, [readIntoState]);

  const retry = useCallback(() => {
    void engineRef.current?.retry();
  }, []);

  return useMemo(
    () => ({
      ready,
      online,
      isSignedIn,
      store,
      notes,
      syncing: status.syncing,
      pending: status.pending,
      failed: status.failed,
      lastError: status.lastError,
      lastFailedType: status.lastFailedType,
      retry,
      refresh,
    }),
    [ready, online, isSignedIn, store, notes, status, retry, refresh]
  );
}
