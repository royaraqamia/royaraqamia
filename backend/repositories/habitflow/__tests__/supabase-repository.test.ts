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

function makeClient(results: Record<string, Result> = {}) {
  const calls: string[] = [];
  const from = vi.fn(
    (table: string) =>
      new Builder(table, calls, () => results[table] ?? { data: null, error: null })
  );
  const client = { from } as unknown as SupabaseClient;
  return { client, calls, from };
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
    it('upserts on (user_id, client_id) when a client id is supplied', async () => {
      const { client, calls } = makeClient({ habits: { data: habitRow, error: null } });
      const repo = new SupabaseHabitRepository(client, 'u-1');

      await repo.createHabit({
        name: 'قراءة',
        frequency: 'daily',
        clientId: '11111111-1111-7111-8111-111111111111',
        updatedAt: '2026-08-01T00:00:00.000Z',
      });

      const upsertCall = calls.find((c) => c.includes('upsert'));
      expect(upsertCall).toContain('"onConflict":"user_id,client_id"');
      expect(upsertCall).toContain('"client_id":"11111111-1111-7111-8111-111111111111"');
      expect(upsertCall).toContain('"updated_at":"2026-08-01T00:00:00.000Z"');
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
    it('getHabits excludes tombstones', async () => {
      const { client, calls } = makeClient({ habits: { data: [habitRow], error: null } });
      const repo = new SupabaseHabitRepository(client, 'u-1');

      await repo.getHabits();

      expect(calls).toContain('habits:is deleted_at=null');
    });

    it('deleteHabit sets deleted_at instead of hard-deleting', async () => {
      const { client, calls } = makeClient({ habits: { data: [habitRow], error: null } });
      const repo = new SupabaseHabitRepository(client, 'u-1');

      await expect(repo.deleteHabit('h-1')).resolves.toBe(true);

      const updateCall = calls.find((c) => c.includes('update'));
      expect(updateCall).toContain('"deleted_at"');
      expect(calls.some((c) => c.includes('delete') && !c.includes('deleted'))).toBe(false);
      expect(calls).toContain('habits:is deleted_at=null');
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
      const { client, calls } = makeClient({
        habit_logs: { data: legacyLog, error: null },
      });
      const repo = new SupabaseHabitRepository(client, 'u-1');

      await repo.toggleLog('h-1', '2026-08-02', true, '22222222-2222-7222-8222-222222222222');

      const updateCall = calls.find((c) => c.includes('update'));
      expect(updateCall).toContain('"updated_at"');
      expect(updateCall).toContain('"client_id":"22222222-2222-7222-8222-222222222222"');
    });
  });
});
