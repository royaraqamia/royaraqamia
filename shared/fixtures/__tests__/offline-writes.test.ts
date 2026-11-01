import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createHttpSyncTransport } from '@/frontend/api/habitflow/sync-transport';
import { conflictWinner } from '@/frontend/shared/local-store/conflict';
import {
  backoffDelay,
  isDue,
  type OutboxEntry,
  type OutboxStatus,
} from '@/frontend/shared/local-store/outbox';
import { SyncEngine, type OutboxStore } from '@/frontend/shared/local-store/sync-engine';
import {
  PermanentSyncError,
  type SyncTransport,
} from '@/frontend/shared/local-store/sync-transport';

/**
 * The Outbox's write semantics, from the web side (#650).
 *
 * The same `shared/fixtures/offline-writes/habitflow.json` the app's
 * `OutboxFixturesTest` runs is the source of every case here: replay order,
 * backoff, the permanent/transient split, what "drained" means, which request an
 * intent becomes, and who wins a conflict. A rule changed in one engine and not
 * the other fails one of the two suites, which is the point of writing them down
 * once instead of twice (`docs/mobile/two-clients.md`, rule 3).
 */
interface FixtureEntry {
  seq: number;
  type?: string;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: number;
}

interface Fixture {
  product: string;
  cases: {
    backoff: Array<{ attempts: number; random: number; delayMs: number }>;
    due: Array<{ name: string; entry: FixtureEntry; now: number; due: boolean }>;
    drain: Array<{
      name: string;
      online: boolean;
      now: number;
      random: number;
      entries: FixtureEntry[];
      outcomes: Record<string, 'accepted' | 'transient' | 'permanent'>;
      expect: {
        sent: number[];
        removed: number[];
        kept: Array<Pick<FixtureEntry, 'seq' | 'status' | 'attempts' | 'nextAttemptAt'>>;
      };
    }>;
    conflict: Array<{
      name: string;
      local: { updatedAt: string | null } | null;
      server: { updatedAt: string | null };
      pending: boolean;
      keep: 'local' | 'server';
    }>;
    requests: Array<{
      name: string;
      type: string;
      payload: Record<string, unknown>;
      request: { method: string; path: string; body?: Record<string, unknown> };
    }>;
  };
}

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), 'shared/fixtures/offline-writes/habitflow.json'), 'utf8')
) as Fixture;

/** An `OutboxEntry` with only the fields a case names. */
function entry(caseEntry: FixtureEntry): OutboxEntry {
  const type = caseEntry.type ?? 'habit.create';
  return {
    seq: caseEntry.seq,
    id: `intent-${caseEntry.seq}`,
    entity: type.split('.')[0] ?? 'unknown',
    type,
    payload: {},
    createdAt: 0,
    attempts: caseEntry.attempts,
    status: caseEntry.status,
    lastError: null,
    nextAttemptAt: caseEntry.nextAttemptAt,
  };
}

/** The slice of the store the engine reads and writes, held in memory. */
class MemoryOutbox implements OutboxStore {
  constructor(public entries: OutboxEntry[]) {}

  async getOutbox(): Promise<OutboxEntry[]> {
    return this.entries.map((row) => ({ ...row })).sort((a, b) => a.seq - b.seq);
  }

  async removeOutbox(seq: number): Promise<void> {
    this.entries = this.entries.filter((row) => row.seq !== seq);
  }

  async patchOutbox(seq: number, patch: Partial<OutboxEntry>): Promise<void> {
    this.entries = this.entries.map((row) => (row.seq === seq ? { ...row, ...patch } : row));
  }

  async retryFailedOutbox(): Promise<void> {
    this.entries = this.entries.map((row) =>
      row.status === 'failed' ? { ...row, status: 'pending', attempts: 0, nextAttemptAt: 0 } : row
    );
  }
}

const engines: SyncEngine[] = [];

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
});

function drainEngine(
  store: MemoryOutbox,
  transport: SyncTransport,
  { online, now, random }: { online: boolean; now: number; random: number }
): SyncEngine {
  const engine = new SyncEngine(
    {
      store,
      transport,
      isSignedIn: () => true,
      isOnline: () => online,
      now: () => now,
      random: () => random,
    },
    {
      lockName: 'fixture-lock',
      channelName: 'fixture-channel',
      logLabel: 'fixture',
      syncedMessage: 'fixture:synced',
    }
  );
  engines.push(engine);
  return engine;
}

describe('the Outbox write semantics both clients promise', () => {
  it('is the HabitFlow queue the app also implements', () => {
    expect(fixture.product).toBe('habitflow');
  });

  it('backs off with full jitter, capped', () => {
    for (const testCase of fixture.cases.backoff) {
      expect(
        backoffDelay(testCase.attempts, () => testCase.random),
        String(testCase.attempts)
      ).toBe(testCase.delayMs);
    }
  });

  it('replays only a pending intent whose time has come', () => {
    for (const testCase of fixture.cases.due) {
      expect(isDue(entry(testCase.entry), testCase.now), testCase.name).toBe(testCase.due);
    }
  });

  it('resolves a pull the same way the app does', () => {
    for (const testCase of fixture.cases.conflict) {
      expect(
        conflictWinner({
          local: testCase.local,
          server: testCase.server,
          pending: testCase.pending,
        }),
        testCase.name
      ).toBe(testCase.keep);
    }
  });

  it('replays every intent to the same endpoint the app replays to', async () => {
    for (const testCase of fixture.cases.requests) {
      const recorded: Array<{ method: string; path: string; body?: string }> = [];
      const transport = createHttpSyncTransport(async (path, init) => {
        recorded.push({ method: init.method, path, body: init.body });
        return {};
      });

      await transport.send({
        ...entry({
          seq: 1,
          type: testCase.type,
          status: 'pending',
          attempts: 0,
          nextAttemptAt: 0,
        }),
        entity: testCase.type.split('.')[0] ?? 'unknown',
        payload: testCase.payload,
      });

      expect(recorded, testCase.name).toHaveLength(1);
      const [sent] = recorded;
      expect(sent?.method, testCase.name).toBe(testCase.request.method);
      expect(sent?.path, testCase.name).toBe(testCase.request.path);
      const body = testCase.request.body ?? testCase.payload;
      expect(JSON.parse(sent?.body ?? 'null'), testCase.name).toEqual(body);
    }
  });

  it('drains, backs off and surfaces failures the way the app does', async () => {
    for (const testCase of fixture.cases.drain) {
      const store = new MemoryOutbox(testCase.entries.map(entry));
      const sent: number[] = [];
      const outcomes = new Map(Object.entries(testCase.outcomes));

      const transport: SyncTransport = {
        async send(entry) {
          sent.push(entry.seq);
          const outcome = outcomes.get(String(entry.seq)) ?? 'accepted';
          if (outcome === 'permanent') throw new PermanentSyncError('refused');
          if (outcome === 'transient') throw new Error('unreachable');
        },
      };

      const engine = drainEngine(store, transport, testCase);
      await engine.flush();

      expect(sent, `${testCase.name}: sent`).toEqual(testCase.expect.sent);
      expect(
        (await store.getOutbox()).map((row) => row.seq),
        `${testCase.name}: kept`
      ).toEqual(testCase.expect.kept.map((row) => row.seq));
      expect(
        (await store.getOutbox()).map((row) => ({
          seq: row.seq,
          status: row.status,
          attempts: row.attempts,
          nextAttemptAt: row.nextAttemptAt,
        })),
        `${testCase.name}: state`
      ).toEqual(testCase.expect.kept);
    }
  });
});
