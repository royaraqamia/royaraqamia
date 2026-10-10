import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const sent: string[] = [];

vi.mock('@/frontend/api/habitflow/sync-transport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/frontend/api/habitflow/sync-transport')>();
  return {
    ...actual,
    createHttpSyncTransport: () => ({
      send: async (entry: { type: string }) => {
        sent.push(entry.type);
      },
    }),
  };
});

vi.mock('@/frontend/api/habitflow/habit-api', () => ({
  ApiClient: {
    fetchInitialData: async () => ({ habits: [], logs: [], mode: 'supabase' }),
  },
}));

import { HabitLocalStore } from '@/frontend/api/habitflow/local-store';
import { userIdentity } from '@/frontend/shared/local-store/identity';
import { useHabitSync } from '@/frontend/state/habitflow/use-habit-sync';

describe('useHabitSync', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    sent.length = 0;
  });

  it('flushes the account outbox on mount', async () => {
    const store = await HabitLocalStore.open(userIdentity('u-1'));
    await store.createHabit({ name: 'قراءة', frequency: 'daily' });

    renderHook(() => useHabitSync(store, true, vi.fn()));

    await waitFor(() => expect(sent).toContain('habit.create'));
    await waitFor(async () => expect(await store.getOutbox()).toHaveLength(0));
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
});
