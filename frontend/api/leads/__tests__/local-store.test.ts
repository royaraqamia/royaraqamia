import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LeadsLocalStore } from '@/frontend/api/leads/local-store';

let factory: IDBFactory;
beforeEach(() => {
  factory = new IDBFactory();
});

describe('LeadsLocalStore', () => {
  it('queues a submission and preserves replay order', async () => {
    const store = await LeadsLocalStore.open(factory);
    await store.enqueue({ entity: 'lead', type: 'training.submit', payload: { a: 1 } });
    await store.enqueue({ entity: 'lead', type: 'retainer.submit', payload: { b: 2 } });

    const outbox = await store.getOutbox();
    expect(outbox.map((entry) => entry.type)).toEqual(['training.submit', 'retainer.submit']);
    expect(outbox.every((entry) => entry.status === 'pending')).toBe(true);
    expect(outbox[0]?.seq).toBeLessThan(outbox[1]!.seq);
    store.close();
  });

  it('removes an acknowledged intent and patches a failed one', async () => {
    const store = await LeadsLocalStore.open(factory);
    await store.enqueue({ entity: 'lead', type: 'training.submit', payload: {} });
    const [entry] = await store.getOutbox();

    await store.patchOutbox(entry!.seq, { status: 'failed', lastError: 'boom' });
    expect((await store.getOutbox())[0]?.status).toBe('failed');

    await store.retryFailedOutbox();
    expect((await store.getOutbox())[0]?.status).toBe('pending');

    await store.removeOutbox(entry!.seq);
    expect(await store.getOutbox()).toHaveLength(0);
    store.close();
  });

  it('notifies subscribers on every committed write', async () => {
    const store = await LeadsLocalStore.open(factory);
    let calls = 0;
    const unsubscribe = store.subscribeWrites(() => {
      calls += 1;
    });
    await store.enqueue({ entity: 'lead', type: 'training.submit', payload: {} });
    unsubscribe();
    await store.enqueue({ entity: 'lead', type: 'training.submit', payload: {} });
    expect(calls).toBe(1);
    store.close();
  });

  // #204: a flush can run past the hook that owns the store, so every method
  // has to stay callable after `close()` — as a no-op, and without ever opening
  // a transaction on the closed connection.
  it('resolves instead of throwing when a late caller uses a closed store', async () => {
    const store = await LeadsLocalStore.open(factory);
    await store.enqueue({ entity: 'lead', type: 'training.submit', payload: {} });
    const [entry] = await store.getOutbox();

    store.close();

    const opened = vi.spyOn(IDBDatabase.prototype, 'transaction');
    try {
      await expect(store.getOutbox()).resolves.toEqual([]);
      await expect(
        store.enqueue({ entity: 'lead', type: 'retainer.submit', payload: {} })
      ).resolves.toBeUndefined();
      await expect(store.removeOutbox(entry!.seq)).resolves.toBeUndefined();
      await expect(store.patchOutbox(entry!.seq, { status: 'failed' })).resolves.toBeUndefined();
      await expect(store.retryFailedOutbox()).resolves.toBeUndefined();
    } finally {
      opened.mockRestore();
    }

    expect(opened).not.toHaveBeenCalled();
  });

  it('does not wake write subscribers for a write that never landed', async () => {
    const store = await LeadsLocalStore.open(factory);
    let calls = 0;
    store.subscribeWrites(() => {
      calls += 1;
    });

    store.close();
    await store.enqueue({ entity: 'lead', type: 'training.submit', payload: {} });

    expect(calls).toBe(0);
  });
});
