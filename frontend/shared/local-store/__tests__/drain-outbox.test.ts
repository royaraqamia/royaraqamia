import { describe, expect, it, vi } from 'vitest';

import {
  drainOutboxes,
  type DrainableProduct,
  type DrainSession,
  type DrainOutcome,
} from '@/frontend/shared/local-store/drain-outbox';
import { userIdentity } from '@/frontend/shared/local-store/identity';
import type { OutboxEntry } from '@/frontend/shared/local-store/outbox';
import { SyncEngine, type OutboxStore } from '@/frontend/shared/local-store/sync-engine';
import {
  PermanentSyncError,
  type SyncTransport,
} from '@/frontend/shared/local-store/sync-transport';

const SESSION: DrainSession = { userId: 'u-1' };
const ENGINE_OPTIONS = {
  lockName: 'test-sync',
  channelName: 'test-sync',
  logLabel: 'TestProduct',
  syncedMessage: 'test:synced',
} as const;

function intent(seq: number, overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    seq,
    id: `intent-${seq}`,
    entity: 'probe',
    type: 'probe.create',
    payload: { seq },
    createdAt: seq,
    attempts: 0,
    status: 'pending',
    lastError: null,
    nextAttemptAt: 0,
    ...overrides,
  };
}

/** An in-memory Outbox whose mutations a test can observe afterwards. */
function fakeOutbox(initial: OutboxEntry[]) {
  const entries = [...initial];
  const store: OutboxStore = {
    getOutbox: async () => entries.map((entry) => ({ ...entry })),
    removeOutbox: async (seq) => {
      const index = entries.findIndex((entry) => entry.seq === seq);
      if (index >= 0) entries.splice(index, 1);
    },
    patchOutbox: async (seq, patch) => {
      const index = entries.findIndex((entry) => entry.seq === seq);
      if (index >= 0) entries[index] = { ...entries[index]!, ...patch };
    },
    retryFailedOutbox: async () => {
      for (const [index, entry] of entries.entries()) {
        if (entry.status === 'failed') {
          entries[index] = { ...entry, status: 'pending', attempts: 0, nextAttemptAt: 0 };
        }
      }
    },
  };

  return { store, entries };
}

interface ProductOverrides {
  product?: string;
  entries?: OutboxEntry[];
  identity?: DrainableProduct['identity'];
  open?: DrainableProduct['open'];
  transport?: SyncTransport;
}

/** A drainable product over the in-memory Outbox, wired to the real engine. */
function product(overrides: ProductOverrides = {}) {
  const { store, entries } = fakeOutbox(overrides.entries ?? [intent(1)]);
  const close = vi.fn();
  const transport = overrides.transport ?? { send: vi.fn().mockResolvedValue(undefined) };

  const descriptor: DrainableProduct = {
    product: overrides.product ?? 'probe',
    identity: overrides.identity ?? (() => userIdentity(SESSION.userId)),
    open: overrides.open ?? (async () => ({ store, transport, close })),
    createEngine: (deps) => new SyncEngine(deps, ENGINE_OPTIONS),
  };

  return { descriptor, store, entries, close, transport };
}

function drain(products: DrainableProduct[]) {
  return drainOutboxes({ session: SESSION, products, existingDatabases: ['probe__user:u-1'] });
}

describe('drainOutboxes', () => {
  it('replays the session identity queue through the product engine', async () => {
    const { descriptor, entries, close, transport } = product({
      entries: [intent(1), intent(2)],
    });

    const outcomes = await drain([descriptor]);

    expect(
      (transport.send as ReturnType<typeof vi.fn>).mock.calls.map(([call]) => call.seq)
    ).toEqual([1, 2]);
    expect(outcomes).toEqual<DrainOutcome[]>([
      { product: 'probe', replayed: 2, pending: 0, failed: 0, error: null },
    ]);
    // The queue is the server's now, and the store is let go of either way.
    expect(entries).toEqual([]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('skips a product whose identity this session does not own', async () => {
    const open = vi.fn();
    const { descriptor } = product({ identity: () => null, open });

    await expect(drain([descriptor])).resolves.toEqual([]);
    expect(open).not.toHaveBeenCalled();
  });

  it('skips a product whose store does not exist', async () => {
    const { descriptor } = product({ open: async () => null });

    await expect(drain([descriptor])).resolves.toEqual([]);
  });

  it('keeps a permanently-refused intent and reports it', async () => {
    const transport: SyncTransport = {
      send: vi.fn().mockRejectedValue(new PermanentSyncError('the server said no')),
    };
    const { descriptor, entries } = product({ transport });

    const outcomes = await drain([descriptor]);

    expect(outcomes[0]).toMatchObject({ failed: 1, pending: 0, error: 'the server said no' });
    expect(entries[0]).toMatchObject({ status: 'failed', lastError: 'the server said no' });
  });

  it('reports what is still queued after a transient failure', async () => {
    // A dropped connection: the intent stays pending, which is what makes the
    // worker ask the browser for another attempt.
    const transport: SyncTransport = { send: vi.fn().mockRejectedValue(new Error('offline')) };
    const { descriptor, entries } = product({ transport });

    const outcomes = await drain([descriptor]);

    expect(outcomes[0]).toMatchObject({ replayed: 0, pending: 1, failed: 0, error: 'offline' });
    expect(entries[0]).toMatchObject({ status: 'pending', attempts: 1 });
  });

  it('carries on with the next product when one cannot be drained', async () => {
    const broken = product({
      product: 'broken',
      open: async () => {
        throw new Error('store unavailable');
      },
    });
    const working = product({ product: 'working' });

    const outcomes = await drain([broken.descriptor, working.descriptor]);

    expect(outcomes).toEqual([
      { product: 'broken', replayed: 0, pending: 0, failed: 0, error: 'store unavailable' },
      { product: 'working', replayed: 1, pending: 0, failed: 0, error: null },
    ]);
    expect(working.close).toHaveBeenCalledTimes(1);
  });

  it('lets go of a store whose transport threw', async () => {
    const transport: SyncTransport = { send: vi.fn().mockRejectedValue(new Error('boom')) };
    const { descriptor, close } = product({ transport });

    await drain([descriptor]);

    expect(close).toHaveBeenCalledTimes(1);
  });
});
