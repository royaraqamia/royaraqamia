import { useCallback, useEffect, useRef, useState } from 'react';
import type { HabitLocalStore } from '@/frontend/api/habitflow/local-store';
import {
  HabitSyncEngine,
  SYNC_CHANNEL,
  type SyncStatus,
} from '@/frontend/api/habitflow/sync-engine';
import { createHttpSyncTransport } from '@/frontend/api/habitflow/sync-transport';
import { ApiClient } from '@/frontend/api/habitflow/habit-api';
import { logger } from '@/frontend/shared/logger';

export interface HabitSyncState extends SyncStatus {
  retry: () => void;
}

const IDLE: SyncStatus = { syncing: false, pending: 0, failed: 0, lastError: null };

/**
 * Owns the Sync Engine's lifecycle and its triggers (ADR-0029): a flush runs on
 * mount, on `online`, on focus and on the tab becoming visible; other tabs
 * announce their flushes over BroadcastChannel so every tab converges without
 * a shared worker.
 */
export function useHabitSync(
  store: HabitLocalStore | null,
  isSignedIn: boolean,
  onRemoteChange: () => void
): HabitSyncState {
  const [status, setStatus] = useState<SyncStatus>(IDLE);
  const engineRef = useRef<HabitSyncEngine | null>(null);
  const refreshRef = useRef(onRemoteChange);
  refreshRef.current = onRemoteChange;

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
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
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

    const unsubscribe = engine.subscribe(setStatus);
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

  const retry = useCallback(() => {
    void engineRef.current?.retry();
  }, []);

  return { ...status, retry };
}
