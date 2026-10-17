import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createSpendtrackRepository } from '@/backend/repositories/spendtrack';

interface Result {
  data: unknown;
  error: unknown;
}

/**
 * PostgREST-shaped fake with an RPC surface. The create-replay paths call a
 * `SECURITY INVOKER` SQL function that applies last-write-wins on `updated_at`
 * and returns the applied row (or no row when the replay is stale), so
 * `opts.rpc` drives that outcome while `opts.tables` serves the follow-up reads.
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

  insert(rows: unknown) {
    return this.log(`insert ${JSON.stringify(rows)}`);
  }
  update(row: unknown) {
    return this.log(`update ${JSON.stringify(row)}`);
  }
  delete() {
    return this.log('delete');
  }
  select(columns?: string) {
    return this.log(`select ${columns ?? ''}`);
  }
  eq(column: string, value: unknown) {
    return this.log(`eq ${column}=${String(value)}`);
  }
  is(column: string, value: unknown) {
    return this.log(`is ${column}=${String(value)}`);
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

function makeClient(opts: { rpc?: Result | Result[]; tables?: Record<string, Result> } = {}) {
  const calls: string[] = [];
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const from = vi.fn(
    (table: string) =>
      new Builder(table, calls, () => opts.tables?.[table] ?? { data: null, error: null })
  );
  let rpcCursor = 0;
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args });
    const entry = opts.rpc ?? { data: [], error: null };
    const next = (): Result => {
      if (Array.isArray(entry)) {
        const index = Math.min(rpcCursor, entry.length - 1);
        rpcCursor += 1;
        return entry[index]!;
      }
      return entry;
    };
    return Promise.resolve(next());
  });
  return { client: { from, rpc } as unknown as SupabaseClient<Database>, calls, rpcCalls };
}

const splitRows = (calls: string[]) => calls.filter((c) => c.startsWith('expense_splits:'));

describe('createExpense — create replay is last-write-wins', () => {
  it('a newer replay upserts through the LWW RPC and replaces the splits', async () => {
    const { client, calls, rpcCalls } = makeClient({
      rpc: { data: [{ id: 'e-1' }], error: null },
    });
    const repo = createSpendtrackRepository(client);

    const id = await repo.createExpense({
      user_id: 'u-1',
      amount: 10,
      category_id: 'c-1',
      date: '2026-10-10',
      description: null,
      clientId: '11111111-1111-7111-8111-111111111111',
      updatedAt: '2026-10-10T00:00:00.000Z',
      splits: [{ category_id: 'c-2', amount: 10 }],
    });

    expect(id).toBe('e-1');
    expect(rpcCalls[0]?.name).toBe('upsert_expense');
    expect(rpcCalls[0]?.args).toMatchObject({
      p_id: '11111111-1111-7111-8111-111111111111',
      p_client_id: '11111111-1111-7111-8111-111111111111',
      p_user_id: 'u-1',
      p_updated_at: '2026-10-10T00:00:00.000Z',
    });
    expect(splitRows(calls)).toContain('expense_splits:delete');
    expect(splitRows(calls).some((c) => c.startsWith('expense_splits:insert'))).toBe(true);
  });

  it('a stale replay leaves the stored row and its splits untouched and still succeeds', async () => {
    // The function applied LWW and returned no row: the stored expense is newer.
    const { client, calls, rpcCalls } = makeClient({ rpc: { data: [], error: null } });
    const repo = createSpendtrackRepository(client);

    const id = await repo.createExpense({
      user_id: 'u-1',
      amount: 999,
      category_id: 'c-1',
      date: '2026-10-10',
      description: 'stale',
      clientId: '11111111-1111-7111-8111-111111111111',
      updatedAt: '2026-10-09T00:00:00.000Z',
      splits: [{ category_id: 'c-2', amount: 999 }],
    });

    expect(rpcCalls[0]?.name).toBe('upsert_expense');
    expect(id).toBe('11111111-1111-7111-8111-111111111111');
    // The stale replay must not delete/reinsert the newer allocation.
    expect(splitRows(calls)).toEqual([]);
  });

  it('falls back to a plain insert without a client id', async () => {
    const { client, calls, rpcCalls } = makeClient({
      tables: { expenses: { data: { id: 'e-2' }, error: null } },
    });
    const repo = createSpendtrackRepository(client);

    const id = await repo.createExpense({
      user_id: 'u-1',
      amount: 5,
      category_id: 'c-1',
      date: '2026-10-10',
      description: null,
    });

    expect(id).toBe('e-2');
    expect(rpcCalls).toEqual([]);
    expect(calls.some((c) => c.startsWith('expenses:insert'))).toBe(true);
  });
});

const recurringRow = {
  id: 'r-1',
  amount: 20,
  category_id: 'c-1',
  description: null,
  day_of_month: 5,
  start_month: '2026-10',
  active: true,
  client_id: '22222222-2222-7222-8222-222222222222',
  updated_at: '2026-10-10T00:00:00.000Z',
  deleted_at: null,
};

describe('createRecurringExpense — create replay is last-write-wins', () => {
  it('a stale replay returns the stored winner', async () => {
    const newer = { ...recurringRow, amount: 30, updated_at: '2026-10-11T00:00:00.000Z' };
    const { client, rpcCalls } = makeClient({
      rpc: { data: [], error: null },
      tables: { recurring_expenses: { data: newer, error: null } },
    });
    const repo = createSpendtrackRepository(client);

    const result = await repo.createRecurringExpense('u-1', {
      amount: 20,
      category_id: 'c-1',
      description: null,
      day_of_month: 5,
      start_month: '2026-10',
      clientId: '22222222-2222-7222-8222-222222222222',
      updatedAt: '2026-10-10T00:00:00.000Z',
    });

    expect(rpcCalls[0]?.name).toBe('upsert_recurring_expense');
    expect(result.amount).toBe(30);
    expect(result.updatedAt).toBe('2026-10-11T00:00:00.000Z');
  });

  it('a newer replay returns the upserted row', async () => {
    const { client } = makeClient({ rpc: { data: [recurringRow], error: null } });
    const repo = createSpendtrackRepository(client);

    const result = await repo.createRecurringExpense('u-1', {
      amount: 20,
      category_id: 'c-1',
      description: null,
      day_of_month: 5,
      start_month: '2026-10',
      clientId: '22222222-2222-7222-8222-222222222222',
      updatedAt: '2026-10-10T00:00:00.000Z',
    });

    expect(result.id).toBe('r-1');
    expect(result.clientId).toBe('22222222-2222-7222-8222-222222222222');
  });
});

describe('createCategory — create replay is last-write-wins', () => {
  it('routes a client-id create through the LWW RPC', async () => {
    const { client, rpcCalls } = makeClient({ rpc: { data: [], error: null } });
    const repo = createSpendtrackRepository(client);

    await repo.createCategory({
      user_id: 'u-1',
      name: 'Food',
      colorHex: '#aabbcc',
      clientId: '33333333-3333-7333-8333-333333333333',
      updatedAt: '2026-10-10T00:00:00.000Z',
    });

    expect(rpcCalls[0]?.name).toBe('upsert_category');
    expect(rpcCalls[0]?.args).toMatchObject({
      p_id: '33333333-3333-7333-8333-333333333333',
      p_user_id: 'u-1',
      p_name: 'Food',
      p_color_hex: '#aabbcc',
      p_updated_at: '2026-10-10T00:00:00.000Z',
    });
  });

  it('falls back to a plain insert without a client id', async () => {
    const { client, calls, rpcCalls } = makeClient();
    const repo = createSpendtrackRepository(client);

    await repo.createCategory({ user_id: 'u-1', name: 'Food', colorHex: '#aabbcc' });

    expect(rpcCalls).toEqual([]);
    expect(calls.some((c) => c.startsWith('categories:insert'))).toBe(true);
  });
});
