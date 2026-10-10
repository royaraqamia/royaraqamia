import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HabitLocalStore } from '@/frontend/api/habitflow/local-store';
import {
  HabitSyncEngine,
  SYNC_CHANNEL,
  type SyncStatus,
} from '@/frontend/api/habitflow/sync-engine';
import { createHttpSyncTransport } from '@/frontend/api/habitflow/sync-transport';
import { ApiClient } from '@/frontend/api/habitflow/habit-api';
import type { OutboxEntry } from '@/frontend/shared/local-store/outbox';
import { logger } from '@/frontend/shared/logger';

export interface HabitSyncState extends SyncStatus {
  /** Whether the browser currently reports a connection (drives the pill). */
  online: boolean;
  /** The queued intents, oldest first — the Outbox as the user sees it. */
  entries: OutboxEntry[];
  /** Habit ids with a change that has not reached the server yet. */
  pendingHabitIds: ReadonlySet<string>;
  /** `${habitId}#${date}` keys of habit-log changes not yet on the server. */
  pendingLogKeys: ReadonlySet<string>;
  retry: () => void;
}

const IDLE: SyncStatus = { syncing: false, pending: 0, failed: 0, lastError: null };

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/**
 * Owns the Sync Engine's lifecycle and its triggers (ADR-0029): a flush runs on
 * mount, on `online`, on focus and on the tab becoming visible; other tabs
 * announce their flushes over BroadcastChannel so every tab converges without
 * a shared worker. It also exposes the Outbox to the UI so pending work is
 * visible per item, not just as a count.
 */
export function useHabitSync(
  store: HabitLocalStore | null,
  isSignedIn: boolean,
  onRemoteChange: () => void
): HabitSyncState {
  const [status, setStatus] = useState<SyncStatus>(IDLE);
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [online, setOnline] = useState(isOnline);
  const engineRef = useRef<HabitSyncEngine | null>(null);
  const refreshRef = useRef(onRemoteChange);
  refreshRef.current = onRemoteChange;

  // Connection state drives the always-visible pill; it is independent of the
  // account gate so a guest still sees whether the device is offline.
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

  // The Outbox is mirrored into React state so a badge can appear the instant a
  // write is queued. `commit` notifies through the store, so this also catches
  // writes made while offline (when no flush runs to emit a status).
  useEffect(() => {
    if (!store) {
      setEntries([]);
      return;
    }
    let active = true;
    const refresh = async () => {
      const next = await store.getOutbox();
      if (active) setEntries(next);
    };
    const unsubscribe = store.subscribeWrites(() => void refresh());
    void refresh();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [store]);

  useEffect(() => {
    if (!store || !isSignedIn) {
      engineRef.current = null;
      setStatus(IDLE);
      return;
    }

    const channel =
      typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(SYNC_CHANNEL) : null;

    const engine = new HabitSyncEngine({
      store,
      transport: createHttpSyncTransport(),
      isSignedIn: () => isSignedIn,
      broadcast: (message) => channel?.postMessage(message),
    });
    engineRef.current = engine;

    const pull = async () => {
      if (!isOnline()) return;
      try {
        const data = await ApiClient.fetchInitialData();
        await store.mergeServerData(data.habits, data.logs);
        refreshRef.current();
      } catch (error) {
        logger.warn('HabitFlow pull failed', { error: String(error) });
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
    if (channel) channel.onmessage = () => void pull();

    // Every status emit is a chance for the Outbox mirror to change (a flush
    // removed or re-armed entries), so refresh it alongside the counts.
    const unsubscribe = engine.subscribe((next) => {
      setStatus(next);
      void store.getOutbox().then(setEntries);
    });
    void runSync();

    return () => {
      unsubscribe();
      window.removeEventListener('online', runSync);
      window.removeEventListener('focus', runSync);
      document.removeEventListener('visibilitychange', onVisibility);
      channel?.close();
      engineRef.current = null;
    };
  }, [store, isSignedIn]);

  const { pendingHabitIds, pendingLogKeys } = useMemo(() => {
    const habitIds = new Set<string>();
    const logKeys = new Set<string>();
    for (const entry of entries) {
      if (entry.entity === 'habit') {
        // Creates carry `clientId` (the row id); updates/deletes carry `id`.
        const p = entry.payload as { id?: string; clientId?: string };
        const id = p.id ?? p.clientId;
        if (id) habitIds.add(id);
      } else if (entry.entity === 'habit_log') {
        const p = entry.payload as { habitId?: string; date?: string };
        if (p.habitId && p.date) logKeys.add(`${p.habitId}#${p.date}`);
      }
    }
    return { pendingHabitIds: habitIds, pendingLogKeys: logKeys };
  }, [entries]);

  const retry = useCallback(() => {
    void engineRef.current?.retry();
  }, []);

  return { ...status, online, entries, pendingHabitIds, pendingLogKeys, retry };
}
