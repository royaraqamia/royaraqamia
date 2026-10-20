import { describe, expect, it } from 'vitest';

import {
  drainOutboxes,
  type DrainableProduct,
  type DrainSession,
} from '@/frontend/shared/local-store/drain-outbox';
import { userIdentity } from '@/frontend/shared/local-store/identity';
import type { OutboxEntry } from '@/frontend/shared/local-store/outbox';
import { SyncEngine, type OutboxStore } from '@/frontend/shared/local-store/sync-engine';
import {
  PermanentSyncError,
  type SyncTransport,
} from '@/frontend/shared/local-store/sync-transport';

const NOW = 1_000_000;
const SESSION: DrainSession = { userId: 'u-1' };

const ENGINE_OPTIONS = {
  lockName: 'test-sync',
  channelName: 'test-sync',
  logLabel: 'Chaos',
  syncedMessage: 'test:synced',
} as const;

/**
 * Chaos: a realm is killed between `transport.send` and `removeOutbox`.
 *
 * The transports here record the send and *then* throw, which is exactly the
 * server-accepted-but-acknowledgement-lost window. Driven through the real
 * `drainOutboxes` entry point and the real `SyncEngine`, so the ordering and
 * failure rules under test are the ones the worker and the Android shell run.
 */

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

/** An in-memory Outbox that survives the engine that used it, like IndexedDB. */
class DurableOutbox implements OutboxStore {
  constructor(public entries: OutboxEntry[]) {}

  async getOutbox() {
    return this.entries.map((entry) => ({ ...entry }));
  }

  async removeOutbox(seq: number) {
    this.entries = this.entries.filter((entry) => entry.seq !== seq);
  }

  async patchOutbox(seq: number, patch: Partial<OutboxEntry>) {
    this.entries = this.entries.map((entry) =>
      entry.seq === seq ? { ...entry, ...patch } : entry
    );
  }

  async retryFailedOutbox() {
    this.entries = this.entries.map((entry) =>
      entry.status === 'failed'
        ? { ...entry, status: 'pending', attempts: 0, nextAttemptAt: 0 }
        : entry
    );
  }
}

type SendOutcome = 'ok' | 'transient' | 'permanent';

/** Records each `send` first, then fails — the lost-acknowledgement window. */
function scriptedTransport(decide: (entry: OutboxEntry, call: number) => SendOutcome) {
  const calls: number[] = [];
  const transport: SyncTransport = {
    async send(entry) {
      calls.push(entry.seq);
      const outcome = decide(entry, calls.length);
      if (outcome === 'transient') throw new Error('the acknowledgement was lost');
      if (outcome === 'permanent') throw new PermanentSyncError('the server refused it');
    },
  };
  return { calls, transport };
}

function harness(entries: OutboxEntry[], transport: SyncTransport) {
  const store = new DurableOutbox(entries);
  let engine: SyncEngine | null = null;

  const descriptor: DrainableProduct = {
    product: 'probe',
    identity: () => userIdentity(SESSION.userId),
    open: async () => ({ store, transport, close: () => {} }),
    createEngine: (deps) => {
      // A fresh realm at the same clock, with the jitter pinned to zero so the
      // backoff is immediately due — the restart is what is under test, not the
      // wall clock.
      engine = new SyncEngine({ ...deps, now: () => NOW, random: () => 0 }, ENGINE_OPTIONS);
      return engine;
    },
  };

  return { descriptor, store, engine: () => engine };
}

function drain(descriptor: DrainableProduct) {
  return drainOutboxes({
    session: SESSION,
    products: [descriptor],
    existingDatabases: ['probe__user:u-1'],
  });
}

describe('sync chaos', () => {
  it('replays an intent whose acknowledgement was lost after the server accepted it', async () => {
    let lost = false;
    const { calls, transport } = scriptedTransport(() => {
      if (lost) return 'ok';
      lost = true;
      return 'transient';
    });
    const { descriptor, store } = harness([intent(1)], transport);

    // The first drain sends, then dies before the entry is removed.
    await drain(descriptor);
    expect(calls).toEqual([1]);
    expect(store.entries).toMatchObject([{ seq: 1, status: 'pending', attempts: 1 }]);

    // The second realm starts from the same intent and delivers it again. The
    // endpoint's client-id upsert is what makes that replay converge rather
    // than duplicate (ADR-0029; `e2e/sync-chaos.spec.ts` proves it live).
    await drain(descriptor);
    expect(calls).toEqual([1, 1]);
    expect(store.entries).toEqual([]);
  });

  it('restarts a drain killed mid-replay at the same intent, not a later one', async () => {
    let killed = false;
    const { calls, transport } = scriptedTransport(() => {
      if (killed) return 'ok';
      killed = true;
      return 'transient';
    });
    const { descriptor, store } = harness([intent(1), intent(2), intent(3)], transport);

    await drain(descriptor);
    expect(calls).toEqual([1]);
    expect(store.entries.map((entry) => entry.seq)).toEqual([1, 2, 3]);

    // Ordered replay: 1 is retried before 2 or 3, never skipped in favour of
    // the intents behind it.
    await drain(descriptor);
    expect(calls).toEqual([1, 1, 2, 3]);
    expect(store.entries).toEqual([]);
  });

  it('keeps a permanently refused intent visible and still delivers the ones behind it', async () => {
    let refuse = true;
    const { calls, transport } = scriptedTransport((entry) =>
      refuse && entry.seq === 1 ? 'permanent' : 'ok'
    );
    const { descriptor, store, engine } = harness(
      [intent(1, { type: 'probe.create' }), intent(2, { type: 'probe.update' })],
      transport
    );

    const outcomes = await drain(descriptor);

    // The bad intent did not block the good one behind it.
    expect(calls).toEqual([1, 2]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ product: 'probe', pending: 0, failed: 1 });

    // Per-item: the intent is kept, with the reason it was refused.
    expect(store.entries).toMatchObject([
      { seq: 1, status: 'failed', lastError: 'the server refused it' },
    ]);

    // Pill: the failed count is what makes the retry button appear.
    await expect(engine()!.status()).resolves.toMatchObject({ pending: 0, failed: 1 });

    // Retry re-arms the refused intent, and the next flush clears the queue.
    refuse = false;
    await engine()!.retry();

    expect(calls).toEqual([1, 2, 1]);
    expect(store.entries).toEqual([]);
  });
});
