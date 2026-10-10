import { describe, it, expect, vi } from 'vitest';
import type { OutboxEntry } from '@/frontend/shared/local-store/outbox';
import { ApiError } from '@/frontend/transport/http';
import {
  HabitSyncEngine,
  type OutboxStore,
  type SyncStatus,
} from '@/frontend/api/habitflow/sync-engine';
import { PermanentSyncError, type SyncTransport } from '@/frontend/api/habitflow/sync-transport';
import { logger } from '@/frontend/shared/logger';

const NOW = 1_000_000;

function entry(id: string, type: string, overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    seq: id.charCodeAt(0) - 96,
    id,
    entity: type.startsWith('habit') ? 'habit' : 'habit_log',
    type,
    payload: { id },
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
  async retryFailedOutbox() {
    this.entries = this.entries.map((e) =>
      e.status === 'failed'
        ? { ...e, status: 'pending', attempts: 0, nextAttemptAt: 0, lastError: null }
        : e
    );
  }
}

function makeEngine(
  entries: OutboxEntry[],
  options: {
    fail?: (entry: OutboxEntry) => Error | null;
    isSignedIn?: boolean;
    isOnline?: boolean;
    onStatus?: (s: SyncStatus) => void;
  } = {}
) {
  const store = new FakeOutbox(entries);
  const sent: string[] = [];
  const transport: SyncTransport = {
    async send(e) {
      const failure = options.fail?.(e);
      if (failure) throw failure;
      sent.push(e.type);
    },
  };
  const engine = new HabitSyncEngine({
    store,
    transport,
    isSignedIn: () => options.isSignedIn ?? true,
    isOnline: () => options.isOnline ?? true,
    now: () => NOW,
    random: () => 1,
    onStatus: options.onStatus,
  });
  return { engine, store, sent };
}

describe('HabitSyncEngine.flush', () => {
  it('replays due intents in order and removes each on success', async () => {
    const { engine, store, sent } = makeEngine([
      entry('a', 'habit.create'),
      entry('b', 'log.toggle'),
    ]);

    await engine.flush();

    expect(sent).toEqual(['habit.create', 'log.toggle']);
    expect(store.entries).toHaveLength(0);
  });

  it('stops on a transient failure, backs off, and preserves order', async () => {
    const { engine, store, sent } = makeEngine(
      [entry('a', 'habit.create'), entry('b', 'log.toggle'), entry('c', 'habit.update')],
      { fail: (e) => (e.id === 'b' ? new TypeError('Failed to fetch') : null) }
    );

    await engine.flush();

    expect(sent).toEqual(['habit.create']);
    const failed = store.entries.find((e) => e.id === 'b')!;
    expect(failed.status).toBe('pending');
    expect(failed.attempts).toBe(1);
    expect(failed.nextAttemptAt).toBeGreaterThan(NOW);
    expect(store.entries.find((e) => e.id === 'c')?.attempts).toBe(0);
  });

  it('marks a permanently-failed intent and carries on with the rest', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const { engine, store, sent } = makeEngine(
      [entry('a', 'habit.create'), entry('b', 'habit.update'), entry('c', 'log.toggle')],
      { fail: (e) => (e.id === 'b' ? new ApiError('bad', 400) : null) }
    );

    await engine.flush();

    expect(sent).toEqual(['habit.create', 'log.toggle']);
    const failed = store.entries.find((e) => e.id === 'b')!;
    expect(failed.status).toBe('failed');
    expect(failed.lastError).toBe('bad');
    warn.mockRestore();
  });

  it('does not flush for a guest or while offline', async () => {
    const guest = makeEngine([entry('a', 'habit.create')], { isSignedIn: false });
    await guest.engine.flush();
    expect(guest.sent).toHaveLength(0);

    const offline = makeEngine([entry('a', 'habit.create')], { isOnline: false });
    await offline.engine.flush();
    expect(offline.sent).toHaveLength(0);
    expect(offline.store.entries).toHaveLength(1);
  });

  it('retry re-arms failed intents and flushes them', async () => {
    let shouldFail = true;
    const { engine, store, sent } = makeEngine([entry('a', 'habit.update')], {
      fail: (e) => (shouldFail && e.type === 'habit.update' ? new ApiError('bad', 422) : null),
    });
    await engine.flush();
    expect(store.entries[0]?.status).toBe('failed');

    shouldFail = false;
    await engine.retry();
    expect(sent).toEqual(['habit.update']);
    expect(store.entries).toHaveLength(0);
  });

  it('reports pending and failed counts through status listeners', async () => {
    const statuses: SyncStatus[] = [];
    const { engine } = makeEngine([entry('a', 'habit.create'), entry('b', 'habit.update')], {
      fail: (e) => (e.id === 'b' ? new PermanentSyncError('nope') : null),
      onStatus: (s) => statuses.push(s),
    });

    await engine.flush();

    const last = statuses.at(-1)!;
    expect(last.pending).toBe(0);
    expect(last.failed).toBe(1);
    expect(last.syncing).toBe(false);
  });
});
