import { describe, it, expect, afterEach, vi } from 'vitest';
import { ApiError } from '@/frontend/transport/http';
import type { OutboxEntry } from '@/frontend/shared/local-store/outbox';
import {
  PermanentSyncError,
  type SyncTransport,
} from '@/frontend/shared/local-store/sync-transport';
import { SyncEngine, type OutboxStore } from '@/frontend/shared/local-store/sync-engine';

const NOW = 1_000_000;

const OPTIONS = {
  lockName: 'self-owned-sync',
  channelName: 'self-owned-sync',
  logLabel: 'Test',
  syncedMessage: 'test:synced',
} as const;

/**
 * A BroadcastChannel double that throws the way the platform does once closed,
 * so "the engine never posts to a closed channel" is asserted directly rather
 * than inferred from an unhandled rejection.
 */
class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;
  readonly posted: Array<{ type: string }> = [];
  closed = false;

  constructor(readonly name: string) {
    FakeBroadcastChannel.instances.push(this);
  }

  postMessage(data: { type: string }) {
    if (this.closed) throw new DOMException('BroadcastChannel is closed', 'InvalidStateError');
    this.posted.push(data);
  }

  close() {
    this.closed = true;
  }

  /** Pretends a sibling tab announced something on the shared channel. */
  emitSibling(data: { type: string }) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

const RealBroadcastChannel = globalThis.BroadcastChannel;
const engines: SyncEngine[] = [];

afterEach(() => {
  // A pending retry timer would otherwise outlive the test and touch a store
  // that this suite no longer owns.
  for (const engine of engines.splice(0)) engine.dispose();
  (globalThis as { BroadcastChannel: typeof BroadcastChannel }).BroadcastChannel =
    RealBroadcastChannel;
  FakeBroadcastChannel.instances = [];
});

function ownBroadcastChannel() {
  (globalThis as { BroadcastChannel: typeof BroadcastChannel }).BroadcastChannel =
    FakeBroadcastChannel as unknown as typeof BroadcastChannel;
}

function entry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    seq: 1,
    id: 'a',
    entity: 'expense',
    type: 'expense.create',
    payload: { id: 'a' },
    createdAt: 0,
    attempts: 0,
    status: 'pending',
    lastError: null,
    nextAttemptAt: 0,
    ...overrides,
  };
}

class FakeOutbox implements OutboxStore {
  constructor(public entries: OutboxEntry[]) {}
  async getOutbox() {
    return this.entries.map((e) => ({ ...e }));
  }
  async removeOutbox(seq: number) {
    this.entries = this.entries.filter((e) => e.seq !== seq);
  }
  async patchOutbox(seq: number, patch: Partial<OutboxEntry>) {
    this.entries = this.entries.map((e) => (e.seq === seq ? { ...e, ...patch } : e));
  }
  async retryFailedOutbox() {}
}

function makeEngine(entries: OutboxEntry[], transport?: SyncTransport): SyncEngine {
  const engine = new SyncEngine(
    {
      store: new FakeOutbox(entries),
      transport: transport ?? { async send() {} },
      isSignedIn: () => true,
      now: () => NOW,
    },
    OPTIONS
  );
  engines.push(engine);
  return engine;
}

describe('SyncEngine channel ownership', () => {
  it('announces a completed flush on its own channel', async () => {
    ownBroadcastChannel();
    const engine = makeEngine([entry()]);

    await engine.flush();

    const channel = FakeBroadcastChannel.instances[0]!;
    expect(channel.name).toBe(OPTIONS.channelName);
    expect(channel.posted).toEqual([{ type: OPTIONS.syncedMessage }]);
  });

  it('does not post to the closed channel when a flush lands after dispose', async () => {
    ownBroadcastChannel();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sent: string[] = [];

    const engine = makeEngine([entry()], {
      async send(e) {
        sent.push(e.type);
        await gate;
      },
    });
    // `onSync` opens the channel; the flush then parks inside `send`.
    engine.onSync(() => {});
    const channel = FakeBroadcastChannel.instances[0]!;

    const flush = engine.flush();
    await vi.waitFor(() => expect(sent).toEqual(['expense.create']));

    // The owner unmounts while that flush is still in flight.
    engine.dispose();
    release();

    await expect(flush).resolves.toBeUndefined();
    expect(channel.closed).toBe(true);
    expect(channel.posted).toEqual([]);
  });

  it('notifies on a sibling flush and falls silent after dispose', () => {
    ownBroadcastChannel();
    const engine = makeEngine([entry()]);
    const onSync = vi.fn();
    engine.onSync(onSync);
    const channel = FakeBroadcastChannel.instances[0]!;

    channel.emitSibling({ type: 'unrelated' });
    expect(onSync).not.toHaveBeenCalled();

    channel.emitSibling({ type: OPTIONS.syncedMessage });
    expect(onSync).toHaveBeenCalledTimes(1);

    engine.dispose();
    channel.emitSibling({ type: OPTIONS.syncedMessage });
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it('is a no-op without BroadcastChannel and survives a double dispose', async () => {
    (globalThis as { BroadcastChannel: typeof BroadcastChannel }).BroadcastChannel =
      undefined as unknown as typeof BroadcastChannel;
    const sent: string[] = [];
    const engine = makeEngine([entry()], {
      async send(e) {
        sent.push(e.type);
      },
    });
    engine.onSync(() => {});

    await expect(engine.flush()).resolves.toBeUndefined();
    expect(sent).toEqual(['expense.create']);
    engine.dispose();
    expect(() => engine.dispose()).not.toThrow();
    expect(FakeBroadcastChannel.instances).toHaveLength(0);
  });
});

describe('SyncEngine outbox ordering', () => {
  it('does not overtake a backing-off intent, then sends it first once it is due', async () => {
    const backingOff = entry({ seq: 1, id: 'a', type: 'habit.delete', nextAttemptAt: NOW + 1_000 });
    const later = entry({ seq: 2, id: 'b', type: 'habit.create' });
    const sent: string[] = [];
    const engine = makeEngine([backingOff, later], {
      async send(e) {
        sent.push(e.type);
      },
    });

    await engine.flush();
    expect(sent).toEqual([]);

    backingOff.nextAttemptAt = 0;
    await engine.flush();
    expect(sent).toEqual(['habit.delete', 'habit.create']);
  });

  it('does not block a later intent when an earlier one fails permanently', async () => {
    const failing = entry({ seq: 1, id: 'a', type: 'habit.delete' });
    const later = entry({ seq: 2, id: 'b', type: 'habit.create' });
    const sent: string[] = [];
    const engine = makeEngine([failing, later], {
      async send(e) {
        if (e.type === 'habit.delete') throw new PermanentSyncError('nope');
        sent.push(e.type);
      },
    });

    await engine.flush();
    expect(sent).toEqual(['habit.create']);
  });
});

describe('SyncEngine retry scheduling', () => {
  it('flushes a write enqueued while a flush was already in flight', async () => {
    vi.useFakeTimers();
    const store = new FakeOutbox([entry({ seq: 1 })]);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sent: string[] = [];
    const engine = new SyncEngine(
      {
        store,
        transport: {
          async send(e) {
            sent.push(e.type);
            if (e.seq === 1) await gate;
          },
        },
        isSignedIn: () => true,
        now: () => NOW,
      },
      OPTIONS
    );
    engines.push(engine);

    const first = engine.flush();
    await vi.waitFor(() => expect(sent).toEqual(['expense.create']));

    // The autosave lands while the first run is still sending; its own flush
    // call cannot start a second run.
    store.entries.push(entry({ seq: 2, id: 'b', type: 'expense.update' }));
    await engine.flush();
    release();
    await first;

    // The run that ended scheduled its own follow-up instead of stranding it.
    await vi.advanceTimersByTimeAsync(500);
    expect(sent).toEqual(['expense.create', 'expense.update']);
    expect(store.entries).toHaveLength(0);
    vi.useRealTimers();
  });

  it('retries a backing-off intent once its delay expires, with no other trigger', async () => {
    vi.useFakeTimers();
    let now = NOW;
    const store = new FakeOutbox([entry()]);
    let failures = 1;
    const sent: string[] = [];
    const engine = new SyncEngine(
      {
        store,
        transport: {
          async send(e) {
            if (failures > 0) {
              failures -= 1;
              throw new Error('network');
            }
            sent.push(e.type);
          },
        },
        isSignedIn: () => true,
        now: () => now,
        random: () => 0,
      },
      OPTIONS
    );
    engines.push(engine);

    // The write made offline backs off, so the flush after reconnecting has
    // nothing due yet.
    await engine.flush();
    expect(sent).toEqual([]);
    expect(store.entries[0]!.attempts).toBe(1);

    now += 1;
    await vi.advanceTimersByTimeAsync(500);
    expect(sent).toEqual(['expense.create']);
    expect(store.entries).toHaveLength(0);
    vi.useRealTimers();
  });
});

describe('SyncEngine transient re-arm', () => {
  it('retries a 401-marked intent on the next flush once the session is valid, without retry()', async () => {
    const store = new FakeOutbox([entry()]);
    let unauthorized = true;
    const sent: string[] = [];
    const engine = new SyncEngine(
      {
        store,
        transport: {
          async send(e) {
            if (unauthorized) throw new ApiError('Unauthorized', 401);
            sent.push(e.type);
          },
        },
        isSignedIn: () => true,
        now: () => NOW,
        random: () => 0,
      },
      OPTIONS
    );
    engines.push(engine);

    // A 401 is transient: the entry backs off and stays pending, not failed.
    await engine.flush();
    expect(sent).toEqual([]);
    expect(store.entries).toHaveLength(1);
    expect(store.entries[0]!.status).toBe('pending');

    // Once auth is restored the very next flush drains it — no retry() needed.
    unauthorized = false;
    await engine.flush();
    expect(sent).toEqual(['expense.create']);
    expect(store.entries).toHaveLength(0);
  });
});
