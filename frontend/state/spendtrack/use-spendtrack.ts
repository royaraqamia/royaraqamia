import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Budget, Category, Expense, RecurringExpense } from '@/shared/contracts/spendtrack';
import { SpendtrackLocalStore } from '@/frontend/api/spendtrack/local-store';
import { pullSpendtrackData } from '@/frontend/api/spendtrack/pull';
import { createSpendtrackHttpSyncTransport } from '@/frontend/api/spendtrack/sync-transport';
import { SpendtrackSyncEngine } from '@/frontend/api/spendtrack/sync-engine';
import { SyncEngine, type SyncStatus } from '@/frontend/shared/local-store/sync-engine';
import { subscribeToSyncHints, userSyncHints } from '@/frontend/api/sync-hints';
import {
  GUEST_IDENTITY,
  identityFromUser,
  identityUserId,
} from '@/frontend/shared/local-store/identity';
import { logger } from '@/frontend/shared/logger';
import { flushOutbox } from '@/frontend/shared/local-store/background-sync';
import { requestPersistentStorageOnce } from '@/frontend/shared/persistent-storage';
import { markContent } from '@/frontend/shared/perf-marks';

/**
 * Tables whose changes mean this surface's data moved on another device
 * (ADR-0060). Published to Realtime by
 * `supabase/migrations/20261019120000_publish_owned_tables_for_realtime_hints.sql`.
 */
export const SYNC_HINT_TABLES = [
  'expenses',
  'categories',
  'budgets',
  'recurring_expenses',
] as const;

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

  /**
   * Reconciles the store with the server's incremental snapshot (LWW,
   * pending-aware), including tombstones, so edits and deletes made on another
   * device land here instead of the store silently diverging. The store only
   * advances its cursor past rows it actually applied (#313). Guests own no
   * server rows beyond the seeded defaults.
   *
   * Every wake-up path runs this — open, reconnect, focus and a Realtime hint —
   * so there is one reconciliation to reason about (ADR-0060).
   */
  const pullServer = useCallback(
    async (target: SpendtrackLocalStore) => {
      if (!isSignedIn) return;
      try {
        // The same pull the background tier runs (ADR-0060): this hook owns
        // *when*, `pullSpendtrackData` owns *how*.
        await pullSpendtrackData(target);
      } catch (error) {
        logger.error('Failed to reconcile SpendTrack data with the server', {
          error: String(error),
        });
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

        // Reconcile with the server on every open, the same way a hint or a
        // wake-up does.
        await pullServer(store);
        if (cancelled) return store.close();

        storeRef.current = store;
        await readIntoState(store);
        if (cancelled) return;
        setStore(store);
        setReady(true);
        // The launch's content mark: owned rows painted from the Local Store (#487).
        markContent();

        // A completed local write is itself a flush trigger while online, so a
        // change reaches the server promptly instead of waiting for a focus event.
        store.subscribeWrites(() => {
          requestPersistentStorageOnce();
          if (!cancelled) void readIntoState(store).catch(() => {});
          flushOutbox(engineRef.current);
        });

        engine = new SpendtrackSyncEngine({
          store,
          transport: createSpendtrackHttpSyncTransport(),
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
