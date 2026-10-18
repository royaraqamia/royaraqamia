import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Budget, Category, Expense, RecurringExpense } from '@/shared/contracts/spendtrack';
import { SpendtrackLocalStore } from '@/frontend/api/spendtrack/local-store';
import { getSyncSnapshot } from '@/frontend/api/spendtrack';
import { createSpendtrackHttpSyncTransport } from '@/frontend/api/spendtrack/sync-transport';
import { SyncEngine, type SyncStatus } from '@/frontend/shared/local-store/sync-engine';
import { GUEST_IDENTITY, identityFromUser } from '@/frontend/shared/local-store/identity';
import { logger } from '@/frontend/shared/logger';

const SPENDTRACK_SYNC_LOCK = 'spendtrack-sync';
const SPENDTRACK_SYNC_CHANNEL = 'spendtrack-sync';
const SYNCED_MESSAGE = 'spendtrack:synced';

export interface SpendtrackSeed {
  categories: readonly Category[];
  expenses: readonly Expense[];
  budgets: readonly Budget[];
  recurring: readonly RecurringExpense[];
  user: { id: string } | null;
}

export interface SpendtrackStoreState {
  ready: boolean;
  online: boolean;
  isSignedIn: boolean;
  store: SpendtrackLocalStore | null;
  categories: Category[];
  expenses: Expense[];
  budgets: Budget[];
  recurring: RecurringExpense[];
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
 * Opens the identity-scoped SpendTrack Local Store, seeds it once from the RSC
 * loader, then treats it as the source of truth the UI renders from. Writes go
 * to the store + Outbox; the Sync Engine (#166) replays them on reconnection.
 */
export function useSpendtrack(seed: SpendtrackSeed): SpendtrackStoreState {
  const [ready, setReady] = useState(false);
  const [store, setStore] = useState<SpendtrackLocalStore | null>(null);
  // Hydration-safe: the server (Node exposes a partial `navigator`) and the
  // first client render must agree, so start "online" and read the real value
  // in an effect.
  const [online, setOnline] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [status, setStatus] = useState<SyncStatus>(EMPTY_STATUS);

  const storeRef = useRef<SpendtrackLocalStore | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);

  const identity = identityFromUser(seed.user);
  const isSignedIn = identity !== GUEST_IDENTITY;

  const readIntoState = useCallback(async (store: SpendtrackLocalStore) => {
    const data = await store.getLocalData();
    setCategories(
      data.categories.filter((row) => !row.deletedAt).sort((a, b) => a.name.localeCompare(b.name))
    );
    setExpenses(data.expenses.filter((row) => !row.deletedAt));
    setBudgets(data.budgets.filter((row) => !row.deletedAt));
    setRecurring(data.recurring.filter((row) => !row.deletedAt));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    let opened: SpendtrackLocalStore | null = null;
    let engine: SyncEngine | null = null;

    SpendtrackLocalStore.open(identity)
      .then(async (store) => {
        opened = store;
        if (cancelled) return store.close();

        if (identity !== GUEST_IDENTITY) {
          const guest = await SpendtrackLocalStore.open(GUEST_IDENTITY);
          try {
            await store.claimFrom(guest);
          } catch (error) {
            logger.error('Failed to claim guest SpendTrack data', { error: String(error) });
          } finally {
            guest.close();
          }
        }
        if (cancelled) return store.close();

        await store.seedIfEmpty(seed);
        if (cancelled) return store.close();

        // Reconcile with the incremental server snapshot on every open (LWW,
        // pending-aware), including tombstones, so edits and deletes made on
        // another device land here instead of the store silently diverging.
        // The store only advances its cursor past rows it actually applied
        // (#313). Guests own no server rows beyond the seeded defaults.
        if (isSignedIn) {
          try {
            const since = await store.getSyncCursor();
            const snapshot = await getSyncSnapshot(since);
            if (!cancelled) await store.applySyncSnapshot(snapshot);
          } catch (error) {
            logger.error('Failed to reconcile SpendTrack data with the server', {
              error: String(error),
            });
          }
        }
        if (cancelled) return store.close();

        storeRef.current = store;
        await readIntoState(store);
        if (cancelled) return;
        setStore(store);
        setReady(true);

        // A completed local write is itself a flush trigger while online, so a
        // change reaches the server promptly instead of waiting for a focus event.
        store.subscribeWrites(() => {
          if (!cancelled) void readIntoState(store).catch(() => {});
          void engineRef.current?.flush();
        });

        engine = new SyncEngine(
          {
            store,
            transport: createSpendtrackHttpSyncTransport(),
            isSignedIn: () => isSignedIn,
            onStatus: (next) => setStatus(next),
          },
          {
            lockName: SPENDTRACK_SYNC_LOCK,
            channelName: SPENDTRACK_SYNC_CHANNEL,
            logLabel: 'SpendTrack',
            syncedMessage: SYNCED_MESSAGE,
          }
        );
        engineRef.current = engine;
        engine.onSync(() => {
          void readIntoState(store);
        });

        void engine.flush();
      })
      .catch((error) => {
        logger.error('Failed to open SpendTrack Local Store', { error: String(error) });
      });

    return () => {
      cancelled = true;
      engine?.dispose();
      opened?.close();
      engineRef.current = null;
      storeRef.current = null;
      setStore(null);
    };
    // The seed only fills an empty store on open; reopening on every seed change
    // would clobber local writes, so identity change is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  useEffect(() => {
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);

    const onOnline = () => {
      setOnline(true);
      void engineRef.current?.flush();
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
  }, []);

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
      categories,
      expenses,
      budgets,
      recurring,
      syncing: status.syncing,
      pending: status.pending,
      failed: status.failed,
      lastError: status.lastError,
      lastFailedType: status.lastFailedType,
      retry,
      refresh,
    }),
    [
      ready,
      online,
      isSignedIn,
      store,
      categories,
      expenses,
      budgets,
      recurring,
      status,
      retry,
      refresh,
    ]
  );
}
