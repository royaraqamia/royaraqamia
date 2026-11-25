import { describe, it, expect, vi } from 'vitest';

const { fetchSyncData } = vi.hoisted(() => ({ fetchSyncData: vi.fn() }));
vi.mock('@/frontend/api/habitflow/habit-api', () => ({
  ApiClient: {
    fetchSyncData: (...args: unknown[]) => fetchSyncData(...args),
  },
}));

import type { HabitLocalStore } from '@/frontend/api/habitflow/local-store';
import { pullHabitData } from '@/frontend/api/habitflow/pull';

function storeWithCursor(cursor: string | null) {
  return {
    getSyncCursor: vi.fn().mockResolvedValue(cursor),
    applySyncSnapshot: vi.fn().mockResolvedValue(undefined),
  };
}

describe('pullHabitData', () => {
  it('sends the cursor the store holds and hands the page back to it', async () => {
    const snapshot = { habits: [], logs: [], mode: 'supabase' as const, cursor: 'c-2' };
    fetchSyncData.mockResolvedValueOnce(snapshot);
    const store = storeWithCursor('c-1');

    const rows = await pullHabitData(store as unknown as HabitLocalStore);

    expect(store.getSyncCursor).toHaveBeenCalledOnce();
    expect(fetchSyncData).toHaveBeenCalledWith('c-1');
    expect(store.applySyncSnapshot).toHaveBeenCalledWith(snapshot);
    expect(rows).toBe(0);
  });

  it('asks for the first page when the store has no cursor', async () => {
    fetchSyncData.mockResolvedValueOnce({ habits: [], logs: [], mode: 'local', cursor: null });
    const store = storeWithCursor(null);

    await pullHabitData(store as unknown as HabitLocalStore);

    expect(fetchSyncData).toHaveBeenCalledWith(null);
  });
});
