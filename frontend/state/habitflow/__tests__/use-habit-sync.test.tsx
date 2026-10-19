import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const sent: string[] = [];
/** When set, `send` parks on it — lets a test hold a flush open across unmount. */
let sendGate: Promise<void> | null = null;

vi.mock('@/frontend/api/habitflow/sync-transport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/frontend/api/habitflow/sync-transport')>();
  return {
    ...actual,
    createHttpSyncTransport: () => ({
      send: async (entry: { type: string }) => {
        sent.push(entry.type);
        if (sendGate) await sendGate;
      },
    }),
  };
});

vi.mock('@/frontend/api/habitflow/habit-api', () => ({
  ApiClient: {
    fetchInitialData: async () => ({ habits: [], logs: [], mode: 'supabase' }),
    fetchSyncData: async () => {
      syncPulls += 1;
      return { habits: [], logs: [], mode: 'supabase' };
    },
  },
}));

let syncPulls = 0;
/** The sources and hint callbacks the surface subscribed with (ADR-0060). */
let hintSources: unknown = null;
const hintCallbacks: Array<() => void> = [];

vi.mock('@/frontend/api/sync-hints', () => ({
  userSyncHints: (tables: readonly string[], userId: string) =>
    tables.map((table) => ({
      table,
      channel: `${table}_sync_hints`,
      filter: `user_id=eq.${userId}`,
    })),
  subscribeToSyncHints: (sources: unknown, onHint: () => void) => {
    hintSources = sources;
    hintCallbacks.push(onHint);
    return () => {
      const index = hintCallbacks.indexOf(onHint);
      if (index >= 0) hintCallbacks.splice(index, 1);
    };
  },
}));

import { HabitLocalStore } from '@/frontend/api/habitflow/local-store';
import { userIdentity } from '@/frontend/shared/local-store/identity';
import { useHabitSync } from '@/frontend/state/habitflow/use-habit-sync';
import {
  useDashboardData,
  type DashboardSeed,
} from '@/frontend/state/habitflow/use-dashboard-data';

const DASHBOARD_SEED: DashboardSeed = {
  habits: [],
  logs: [],
  mode: 'supabase',
  user: { id: 'u-1' },
};

describe('useHabitSync', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    sent.length = 0;
    sendGate = null;
    syncPulls = 0;
    hintSources = null;
    hintCallbacks.length = 0;
  });

  it('flushes the account outbox on mount', async () => {
    const store = await HabitLocalStore.open(userIdentity('u-1'));
    await store.createHabit({ name: 'قراءة', frequency: 'daily' });

    renderHook(() => useHabitSync(store, true, vi.fn()));

    await waitFor(() => expect(sent).toContain('habit.create'));
    await waitFor(async () => expect(await store.getOutbox()).toHaveLength(0));
    store.close();
  });

  it('flushes a signed-in write without waiting for a focus event', async () => {
    const store = await HabitLocalStore.open(userIdentity('u-1'));
    const { unmount } = renderHook(() => useHabitSync(store, true, vi.fn()));

    // Nothing is queued at mount, so the write itself is the only thing that can
    // send — no focus, online or visibility event is dispatched.
    await act(async () => {
      await store.createHabit({ name: 'قراءة', frequency: 'daily' });
    });

    await waitFor(() => expect(sent).toContain('habit.create'));
    await waitFor(async () => expect(await store.getOutbox()).toHaveLength(0));
    unmount();
    store.close();
  });

  it('never flushes a guest outbox', async () => {
    const store = await HabitLocalStore.open(userIdentity('u-1'));
    await store.createHabit({ name: 'قراءة', frequency: 'daily' });

    renderHook(() => useHabitSync(store, false, vi.fn()));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sent).toHaveLength(0);
    expect(await store.getOutbox()).toHaveLength(1);
    store.close();
  });

  it('mirrors the outbox into entries and per-item pending ids', async () => {
    const store = await HabitLocalStore.open(userIdentity('u-1'));
    const { result } = renderHook(() => useHabitSync(store, false, vi.fn()));

    let habitId = '';
    await act(async () => {
      habitId = (await store.createHabit({ name: 'قراءة', frequency: 'daily' })).id;
    });

    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    expect(result.current.pendingHabitIds.has(habitId)).toBe(true);

    await act(async () => {
      await store.toggleLog(habitId, '2026-08-02', true);
    });
    await waitFor(() =>
      expect(result.current.pendingLogKeys.has(`${habitId}#2026-08-02`)).toBe(true)
    );
    store.close();
  });

  it('reports the connection state', async () => {
    const store = await HabitLocalStore.open(userIdentity('u-1'));
    const { result } = renderHook(() => useHabitSync(store, false, vi.fn()));
    expect(result.current.online).toBe(true);
    store.close();
  });

  // ADR-0060: another device's write arrives as a Realtime hint, and the surface
  // answers it with the same pull it already runs on mount, focus and reconnect.
  it('pulls when a Realtime hint says another device wrote', async () => {
    const store = await HabitLocalStore.open(userIdentity('u-1'));
    renderHook(() => useHabitSync(store, true, vi.fn()));

    await waitFor(() => expect(hintCallbacks).toHaveLength(1));
    await waitFor(() => expect(syncPulls).toBeGreaterThanOrEqual(1));

    // This surface's own tables, scoped to this account: RLS decides what may
    // arrive, and the filter keeps another account's writes off the wire.
    expect(hintSources).toEqual([
      { table: 'habits', channel: 'habits_sync_hints', filter: 'user_id=eq.u-1' },
      { table: 'habit_logs', channel: 'habit_logs_sync_hints', filter: 'user_id=eq.u-1' },
    ]);

    const pullsBefore = syncPulls;
    await act(async () => {
      for (const hint of [...hintCallbacks]) hint();
    });

    await waitFor(() => expect(syncPulls).toBe(pullsBefore + 1));
    store.close();
  });

  it('holds no hint subscription for a guest', async () => {
    const store = await HabitLocalStore.open(userIdentity('u-1'));
    renderHook(() => useHabitSync(store, false, vi.fn()));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(hintCallbacks).toHaveLength(0);
    store.close();
  });

  it('does not post on a closed channel when a flush lands after unmount', async () => {
    const store = await HabitLocalStore.open(userIdentity('u-1'));
    await store.createHabit({ name: 'قراءة', frequency: 'daily' });

    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', onRejection);

    let releaseSend: () => void = () => {};
    sendGate = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });

    try {
      const { unmount } = renderHook(() => useHabitSync(store, true, vi.fn()));

      // The flush parks inside `send`, so the engine still owes a broadcast.
      await waitFor(() => expect(sent).toContain('habit.create'));

      // Cleanup closes the channel while that flush is still in flight.
      unmount();
      releaseSend();

      await waitFor(async () => expect(await store.getOutbox()).toHaveLength(0));
      // Give a rejection raised by the late broadcast a tick to surface.
      await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
      process.off('unhandledRejection', onRejection);
      store.close();
    }

    expect(rejections).toEqual([]);
  });

  // #204: here the store-owning hook (`useDashboardData`) and the engine-owning
  // hook (`useHabitSync`) are separate, but both clean up on the same unmount —
  // the store closes while the flush is still parked inside `send`. The next
  // store call must not reject on the closed connection.
  it('abandons an in-flight flush without rejecting when the store owner unmounts', async () => {
    const seeded = await HabitLocalStore.open(userIdentity('u-1'));
    await seeded.createHabit({ name: 'قراءة', frequency: 'daily' });

    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', onRejection);

    let releaseSend: () => void = () => {};
    sendGate = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });

    try {
      const { result, unmount } = renderHook(() => {
        const dashboard = useDashboardData(DASHBOARD_SEED);
        useHabitSync(dashboard.store, true, vi.fn());
        return dashboard;
      });
      await waitFor(() => expect(result.current.store).not.toBeNull());
      // The flush has picked the intent up and is parked inside `send`.
      await waitFor(() => expect(sent).toContain('habit.create'));

      // The dashboard hook's cleanup closes the store while that flush is in flight.
      unmount();
      releaseSend();

      // Give a rejection raised by the post-unmount store calls a tick to surface.
      await new Promise((resolve) => setTimeout(resolve, 30));
    } finally {
      process.off('unhandledRejection', onRejection);
      seeded.close();
    }

    expect(rejections).toEqual([]);

    const store = await HabitLocalStore.open(userIdentity('u-1'));
    expect(await store.getOutbox()).toHaveLength(1);
    store.close();
  });
});
