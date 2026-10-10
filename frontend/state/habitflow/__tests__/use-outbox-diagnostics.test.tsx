import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

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

import { HabitLocalStore } from '@/frontend/api/habitflow/local-store';
import { userIdentity } from '@/frontend/shared/local-store/identity';
import { useOutboxDiagnostics } from '@/frontend/state/habitflow/use-outbox-diagnostics';

describe('useOutboxDiagnostics', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    sent.length = 0;
  });

  it('lists queued changes and retries them through the transport', async () => {
    const seed = await HabitLocalStore.open(userIdentity('u-1'));
    await seed.createHabit({ name: 'قراءة', frequency: 'daily' });
    seed.close();

    const { result } = renderHook(() => useOutboxDiagnostics({ id: 'u-1' }));

    await waitFor(() => expect(result.current.ready).toBe(true));
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    expect(result.current.pending).toBe(1);
    expect(result.current.failed).toBe(0);

    await act(async () => {
      await result.current.retry();
    });

    await waitFor(() => expect(result.current.entries).toHaveLength(0));
    expect(sent).toContain('habit.create');
  });

  it('removes this device copy without touching the server', async () => {
    const seed = await HabitLocalStore.open(userIdentity('u-1'));
    await seed.createHabit({ name: 'قراءة', frequency: 'daily' });
    seed.close();

    const { result } = renderHook(() => useOutboxDiagnostics({ id: 'u-1' }));
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    await act(async () => {
      await result.current.removeLocalCopy();
    });
    await waitFor(() => expect(result.current.entries).toHaveLength(0));

    const check = await HabitLocalStore.open(userIdentity('u-1'));
    expect(await check.getHabits()).toHaveLength(0);
    expect(await check.getOutbox()).toHaveLength(0);
    check.close();
  });

  it('stays inert for a guest', async () => {
    const { result } = renderHook(() => useOutboxDiagnostics(null));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(result.current.ready).toBe(false);
    expect(result.current.entries).toHaveLength(0);
  });
});
