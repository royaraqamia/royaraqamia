import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// The reconcile pull hits the network on open; keep it local and empty.
vi.mock('@/frontend/api/spendtrack', () => ({
  getSyncSnapshot: vi.fn().mockResolvedValue({
    categories: [],
    expenses: [],
    budgets: [],
    recurring: [],
    cursor: null,
  }),
}));

import { useSpendtrack } from '@/frontend/state/spendtrack/use-spendtrack';

const SEED = {
  categories: [],
  expenses: [],
  budgets: [],
  recurring: [],
  user: { id: 'u-1' },
} as const;

describe('useSpendtrack', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  // The engine owns the channel now (#200); the hook's job is to dispose it.
  // Disposal is what stops a flush that lands after teardown from posting to a
  // closed channel — proven at the engine level in
  // `shared/local-store/__tests__/sync-engine.test.ts`.
  it('closes its broadcast channel when it unmounts', async () => {
    const closed: string[] = [];
    const originalClose = BroadcastChannel.prototype.close;
    BroadcastChannel.prototype.close = function (this: BroadcastChannel) {
      closed.push(this.name);
      return originalClose.call(this);
    };

    try {
      const { result, unmount } = renderHook(() => useSpendtrack(SEED));
      await waitFor(() => expect(result.current.ready).toBe(true));

      unmount();

      expect(closed).toContain('spendtrack-sync');
    } finally {
      BroadcastChannel.prototype.close = originalClose;
    }
  });
});
