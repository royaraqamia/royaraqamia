import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseHabitRepository } from '@/backend/repositories/habitflow/supabase-repository';

interface Result {
  data: unknown;
  error: unknown;
}

/**
 * Minimal PostgREST-shaped fake: records the builder chain per table so tests
 * can assert the exact filters (notably the tombstone filter) and conflict key.
 *
 * A table's result may be a queue: each terminal call (await / single /
 * maybeSingle) consumes the next entry, so a test can script "fetch existing,
 * then filtered update, then re-fetch the winner".
 */
class Builder {
  constructor(
    private readonly table: string,
    private readonly calls: string[],
    private readonly result: () => Result
  ) {}

  private log(op: string) {
    this.calls.push(`${this.table}:${op}`);
    return this;
  }

  select() {
    return this.log('select');
  }
  insert(row: unknown) {
    return this.log(`insert ${JSON.stringify(row)}`);
  }
  upsert(row: unknown, opts: unknown) {
    return this.log(`upsert ${JSON.stringify({ row, opts })}`);
  }
  update(row: unknown) {
    return this.log(`update ${JSON.stringify(row)}`);
  }
  delete() {
    return this.log('delete');
  }
  eq(column: string, value: unknown) {
    return this.log(`eq ${column}=${String(value)}`);
  }
  is(column: string, value: unknown) {
    return this.log(`is ${column}=${String(value)}`);
  }
  gte(column: string, value: unknown) {
    return this.log(`gte ${column}=${String(value)}`);
  }
  lte(column: string, value: unknown) {
    return this.log(`lte ${column}=${String(value)}`);
  }
  order(column: string) {
    return this.log(`order ${column}`);
  }
  maybeSingle() {
    this.log('maybeSingle');
    return Promise.resolve(this.result());
  }
  single() {
    this.log('single');
    return Promise.resolve(this.result());
  }
  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.result()).then(onfulfilled, onrejected);
  }
}

function makeClient(
  results: Record<string, Result | Result[]> = {},
  rpcResults: Result | Result[] = { data: null, error: null }
) {
  const calls: string[] = [];
  const cursors: Record<string, number> = {};
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  let rpcCursor = 0;
  const from = vi.fn((table: string) => {
    const entry = results[table];
    const next = (): Result => {
      if (Array.isArray(entry)) {
        const index = Math.min(cursors[table] ?? 0, entry.length - 1);
        cursors[table] = (cursors[table] ?? 0) + 1;
        return entry[index]!;
      }
      return entry ?? { data: null, error: null };
    };
    return new Builder(table, calls, next);
  });
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args });
    const nextRpc = (): Result => {
      if (Array.isArray(rpcResults)) {
        const index = Math.min(rpcCursor, rpcResults.length - 1);
        rpcCursor += 1;
        return rpcResults[index]!;
      }
      return rpcResults;
    };
    return Promise.resolve(nextRpc());
  });
  const client = { from, rpc } as unknown as SupabaseClient;
  return { client, calls, from, rpc, rpcCalls };
}

const habitRow = {
  id: 'h-1',
  name: 'قراءة',
  frequency: 'daily',
  created_at: '2026-08-01T00:00:00.000Z',
  archived: false,
  user_id: 'u-1',
  target: null,
  target_period: null,
  reminder_time: null,
  client_id: '11111111-1111-7111-8111-111111111111',
  updated_at: '2026-08-01T00:00:00.000Z',
  deleted_at: null,
};

const logRow = {
  id: 'l-1',
  habit_id: 'h-1',
  date: '2026-08-02',
  completed: true,
  completed_at: '2026-08-02T00:00:00.000Z',
  log_kind: 'complete',
  note: null,
  user_id: 'u-1',
  client_id: '22222222-2222-7222-8222-222222222222',
  updated_at: '2026-08-02T00:00:00.000Z',
  deleted_at: null,
};

describe('SupabaseHabitRepository — offline write contract', () => {
  describe('createHabit', () => {
    it('applies the create upsert through the last-write-wins RPC when a client id is supplied', async () => {
      const { client, rpcCalls } = makeClient(
        { habits: { data: habitRow, error: null } },
        { data: [habitRow], error: null }
      );
      const repo = new SupabaseHabitRepository(client, 'u-1');

      await repo.createHabit({
        name: 'قراءة',
        frequency: 'daily',
        clientId: '11111111-1111-7111-8111-111111111111',
        updatedAt: '2026-08-01T00:00:00.000Z',
      });

      expect(rpcCalls[0]?.name).toBe('upsert_habit');
      expect(rpcCalls[0]?.args).toMatchObject({
        // The client id becomes the row's primary key, so an offline log can
        // reference this habit by the same UUID the device minted (#164).
        p_id: '11111111-1111-7111-8111-111111111111',
        p_client_id: '11111111-1111-7111-8111-111111111111',
        p_user_id: 'u-1',
        p_name: 'قراءة',
        p_frequency: 'daily',
        p_updated_at: '2026-08-01T00:00:00.000Z',
      });
    });

    it('a stale create replay is a no-op that returns the stored winner', async () => {
      const newerRow = {
        ...habitRow,
        name: 'قراءة يومية',
        updated_at: '2026-08-05T00:00:00.000Z',
      };
      const { client, rpcCalls } = makeClient(
        // The LWW RPC filtered the upsert (no row), then the winner is re-read.
        { habits: { data: newerRow, error: null } },
        { data: [], error: null }
      );
      const repo = new SupabaseHabitRepository(client, 'u-1');

      const result = await repo.createHabit({
        name: 'اسم قديم',
        frequency: 'daily',
        clientId: '11111111-1111-7111-8111-111111111111',
        updatedAt: '2026-08-01T00:00:00.000Z',
      });

      expect(rpcCalls[0]?.name).toBe('upsert_habit');
      expect(result.name).toBe('قراءة يومية');
      expect(result.updatedAt).toBe('2026-08-05T00:00:00.000Z');
    });

    it('a newer create replay still upserts idempotently', async () => {
      const applied = { ...habitRow, updated_at: '2026-08-06T00:00:00.000Z' };
      const { client, rpcCalls } = makeClient({}, { data: [applied], error: null });
      const repo = new SupabaseHabitRepository(client, 'u-1');

      const result = await repo.createHabit({
        name: 'قراءة',
        frequency: 'daily',
        clientId: '11111111-1111-7111-8111-111111111111',
        updatedAt: '2026-08-06T00:00:00.000Z',
      });

      expect(rpcCalls[0]?.name).toBe('upsert_habit');
      expect(result.updatedAt).toBe('2026-08-06T00:00:00.000Z');
    });

    it('falls back to a plain insert without a client id', async () => {
      const { client, calls } = makeClient({ habits: { data: habitRow, error: null } });
      const repo = new SupabaseHabitRepository(client, 'u-1');

      await repo.createHabit({ name: 'قراءة', frequency: 'daily' });

      expect(calls.some((c) => c.includes('insert'))).toBe(true);
      expect(calls.some((c) => c.includes('upsert'))).toBe(false);
    });
  });

  describe('tombstone semantics', () => {
    it('updateHabit applies last-write-wins on updated_at', async () => {
      const { client, calls } = makeClient({ habits: { data: [habitRow], error: null } });
      const repo = new SupabaseHabitRepository(client, 'u-1');
      const updatedAt = '2026-08-05T00:00:00.000Z';

      await repo.updateHabit('h-1', { name: 'قراءة', updatedAt });

      expect(calls.some((c) => c.includes(`lte updated_at=${updatedAt}`))).toBe(true);
      expect(calls.find((c) => c.includes('update'))).toContain(`"updated_at":"${updatedAt}"`);
    });

    it('a stale edit is a no-op that returns the newer row', async () => {
      const newerRow = { ...habitRow, name: 'قراءة يومية', updated_at: '2026-08-05T00:00:00.000Z' };
      const { client } = makeClient({
        habits: [
          // The update matched nothing: the stored row is newer.
          { data: [], error: null },
          // Re-read of the winning row.
          { data: newerRow, error: null },
        ],
      });
      const repo = new SupabaseHabitRepository(client, 'u-1');

      const result = await repo.updateHabit('h-1', {
        name: 'اسم قديم',
        updatedAt: '2026-08-01T00:00:00.000Z',
      });

      expect(result.name).toBe('قراءة يومية');
      expect(result.updatedAt).toBe('2026-08-05T00:00:00.000Z');
    });

    it('a stale undo does not revive a newer tombstone', async () => {
      const tombstone = {
        ...habitRow,
        name: 'قراءة',
        deleted_at: '2026-08-05T00:00:00.000Z',
        updated_at: '2026-08-05T00:00:00.000Z',
      };
      const { client, calls } = makeClient({
        habits: [
          { data: [], error: null },
          { data: tombstone, error: null },
        ],
      });
      const repo = new SupabaseHabitRepository(client, 'u-1');

      const result = await repo.updateHabit('h-1', {
        deletedAt: null,
        updatedAt: '2026-08-01T00:00:00.000Z',
      });

      // The resurrect was filtered, so the tombstone survives.
      expect(result.deletedAt).toBe('2026-08-05T00:00:00.000Z');
      expect(calls.some((c) => c.includes('lte updated_at=2026-08-01T00:00:00.000Z'))).toBe(true);
    });

    it('getHabits excludes tombstones', async () => {
      const { client, calls } = makeClient({ habits: { data: [habitRow], error: null } });
      const repo = new SupabaseHabitRepository(client, 'u-1');

      await repo.getHabits();

      expect(calls).toContain('habits:is deleted_at=null');
    });

    it('getSyncData includes tombstones for both habits and logs', async () => {
      const deletedAt = '2026-08-05T00:00:00.000Z';
      const { client, calls } = makeClient({
        habits: { data: [{ ...habitRow, deleted_at: deletedAt }], error: null },
        habit_logs: { data: [{ ...logRow, deleted_at: deletedAt }], error: null },
      });
      const repo = new SupabaseHabitRepository(client, 'u-1');

      const data = await repo.getSyncData();

      // The sync read is deliberately unfiltered by `deleted_at`.
      expect(calls).not.toContain('habits:is deleted_at=null');
      expect(calls).not.toContain('habit_logs:is deleted_at=null');
      expect(calls).toContain('habits:eq user_id=u-1');
      expect(calls).toContain('habit_logs:eq user_id=u-1');
      expect(data.habits[0]?.deletedAt).toBe(deletedAt);
      expect(data.logs[0]?.deletedAt).toBe(deletedAt);
    });

    it('deleteHabit tombstones with last-write-wins on updated_at', async () => {
      const { client, calls } = makeClient({ habits: { data: [habitRow], error: null } });
      const repo = new SupabaseHabitRepository(client, 'u-1');
      const deletedAt = '2026-08-01T00:00:00.000Z';

      await expect(repo.deleteHabit('h-1', { updatedAt: deletedAt })).resolves.toBe(true);

      const updateCall = calls.find((c) => c.includes('update'));
      expect(updateCall).toContain(`"deleted_at":"${deletedAt}"`);
      // A replayed older delete is filtered, so it can't re-tombstone a newer
      // resurrect; a later delete re-stamps.
      expect(calls.some((c) => c.includes(`lte updated_at=${deletedAt}`))).toBe(true);
      expect(calls.some((c) => c.includes('delete') && !c.includes('deleted'))).toBe(false);
    });
  });

  describe('getLogs / toggleLog', () => {
    it('getLogs excludes tombstones within the date window', async () => {
      const { client, calls } = makeClient({ habit_logs: { data: [logRow], error: null } });
      const repo = new SupabaseHabitRepository(client, 'u-1');

      await repo.getLogs('2026-08-01', '2026-08-31');

      expect(calls).toContain('habit_logs:is deleted_at=null');
    });

    it('toggleLog stamps updated_at and passes through the client id', async () => {
      const legacyLog = { ...logRow, client_id: null };
      const updated = { ...legacyLog, client_id: '22222222-2222-7222-8222-222222222222' };
      const { client, calls } = makeClient({
        habit_logs: [
          { data: legacyLog, error: null },
          { data: [updated], error: null },
        ],
      });
      const repo = new SupabaseHabitRepository(client, 'u-1');

      const result = await repo.toggleLog(
        'h-1',
        '2026-08-02',
        true,
        '22222222-2222-7222-8222-222222222222'
      );

      const updateCall = calls.find((c) => c.includes('update'));
      expect(updateCall).toContain('"updated_at"');
      expect(updateCall).toContain('"client_id":"22222222-2222-7222-8222-222222222222"');
      expect(result.clientId).toBe('22222222-2222-7222-8222-222222222222');
    });
  });

  describe('log last-write-wins', () => {
    const newerAt = '2026-08-05T00:00:00.000Z';
    const olderAt = '2026-08-01T00:00:00.000Z';
    const newerLog = { ...logRow, updated_at: newerAt };

    it('toggleLog gates the row update on the client write time', async () => {
      const applied = { ...logRow, completed: false, log_kind: 'none', updated_at: newerAt };
      const { client, calls } = makeClient({
        habit_logs: [
          { data: logRow, error: null },
          { data: [applied], error: null },
        ],
      });
      const repo = new SupabaseHabitRepository(client, 'u-1');

      const result = await repo.toggleLog('h-1', '2026-08-02', false, undefined, newerAt);

      expect(calls.some((c) => c.includes(`lte updated_at=${newerAt}`))).toBe(true);
      expect(calls.find((c) => c.includes('update'))).toContain(`"updated_at":"${newerAt}"`);
      expect(result.completed).toBe(false);
    });

    it('a stale toggle is a no-op that returns the newer row', async () => {
      const { client, calls } = makeClient({
        habit_logs: [
          { data: newerLog, error: null },
          // The LWW predicate filtered the update: nothing came back.
          { data: [], error: null },
          // Re-read of the winning row.
          { data: newerLog, error: null },
        ],
      });
      const repo = new SupabaseHabitRepository(client, 'u-1');

      const result = await repo.toggleLog('h-1', '2026-08-02', false, undefined, olderAt);

      expect(calls.some((c) => c.includes(`lte updated_at=${olderAt}`))).toBe(true);
      expect(result.updatedAt).toBe(newerAt);
      expect(result.completed).toBe(true);
    });

    it('setLogKind applies the same gate and returns the winner when stale', async () => {
      const { client, calls } = makeClient({
        habit_logs: [
          { data: newerLog, error: null },
          { data: [], error: null },
          { data: newerLog, error: null },
        ],
      });
      const repo = new SupabaseHabitRepository(client, 'u-1');

      const result = await repo.setLogKind('h-1', '2026-08-02', 'miss', undefined, olderAt);

      expect(calls.some((c) => c.includes(`lte updated_at=${olderAt}`))).toBe(true);
      expect(result.kind).toBe('complete');
      expect(result.updatedAt).toBe(newerAt);
    });

    it('setLogNote applies the same gate and returns the winner when stale', async () => {
      const { client, calls } = makeClient({
        habit_logs: [
          { data: newerLog, error: null },
          { data: [], error: null },
          { data: newerLog, error: null },
        ],
      });
      const repo = new SupabaseHabitRepository(client, 'u-1');

      const result = await repo.setLogNote('h-1', '2026-08-02', 'ملاحظة قديمة', undefined, olderAt);

      expect(calls.some((c) => c.includes(`lte updated_at=${olderAt}`))).toBe(true);
      expect(result.updatedAt).toBe(newerAt);
    });

    it('falls back to a server stamp when no client time is supplied', async () => {
      const { client, calls } = makeClient({
        habit_logs: [
          { data: logRow, error: null },
          { data: [logRow], error: null },
        ],
      });
      const repo = new SupabaseHabitRepository(client, 'u-1');

      await repo.toggleLog('h-1', '2026-08-02', true);

      const updateCall = calls.find((c) => c.startsWith('habit_logs:update'))!;
      const row = JSON.parse(updateCall.slice('habit_logs:update '.length)) as {
        updated_at: string;
      };
      expect(new Date(row.updated_at).toISOString()).toBe(row.updated_at);
    });
  });
});
