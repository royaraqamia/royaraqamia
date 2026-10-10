import { useCallback, useEffect, useState } from 'react';
import { HabitLocalStore } from '@/frontend/api/habitflow/local-store';
import { HabitSyncEngine } from '@/frontend/api/habitflow/sync-engine';
import { createHttpSyncTransport } from '@/frontend/api/habitflow/sync-transport';
import type { OutboxEntry } from '@/frontend/shared/local-store/outbox';
import { GUEST_IDENTITY, identityFromUser } from '@/frontend/shared/local-store/identity';
import { logger } from '@/frontend/shared/logger';

export interface OutboxDiagnostics {
  /** True once the account's Local Store is open and its Outbox has been read. */
  ready: boolean;
  online: boolean;
  /** Queued intents, oldest first. */
  entries: OutboxEntry[];
  pending: number;
  failed: number;
  retrying: boolean;
  retry: () => Promise<void>;
  /** Deletes this device's habits, logs and Outbox for the signed-in account. */
  removeLocalCopy: () => Promise<void>;
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/**
 * Reads the signed-in account's Outbox for the `/account` diagnostics view.
 *
 * It deliberately runs no background sync loop: the point of the view is to
 * inspect and act on queued work, and a loop would re-merge the server's copy
 * right after "remove this device's copy" clears it. Retry spins up a one-shot
 * engine instead.
 */
export function useOutboxDiagnostics(user: unknown): OutboxDiagnostics {
  const identity = identityFromUser(user);
  const isSignedIn = identity !== GUEST_IDENTITY;
  const [store, setStore] = useState<HabitLocalStore | null>(null);
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [online, setOnline] = useState(isOnline);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !isSignedIn) {
      setStore(null);
      return;
    }
    let cancelled = false;
    let opened: HabitLocalStore | null = null;
    HabitLocalStore.open(identity)
      .then((localStore) => {
        if (cancelled) {
          localStore.close();
          return;
        }
        opened = localStore;
        setStore(localStore);
      })
      .catch((error) => {
        logger.error('Failed to open HabitFlow Local Store for diagnostics', {
          error: String(error),
        });
      });
    return () => {
      cancelled = true;
      opened?.close();
    };
  }, [identity, isSignedIn]);

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

  const retry = useCallback(async () => {
    if (!store) return;
    setRetrying(true);
    try {
      const engine = new HabitSyncEngine({
        store,
        transport: createHttpSyncTransport(),
        isSignedIn: () => true,
      });
      await engine.retry();
    } finally {
      setRetrying(false);
    }
  }, [store]);

  const removeLocalCopy = useCallback(async () => {
    if (!store) return;
    await store.clear();
  }, [store]);

  const pending = entries.filter((entry) => entry.status === 'pending').length;
  const failed = entries.filter((entry) => entry.status === 'failed').length;

  return {
    ready: store !== null,
    online,
    entries,
    pending,
    failed,
    retrying,
    retry,
    removeLocalCopy,
  };
}
