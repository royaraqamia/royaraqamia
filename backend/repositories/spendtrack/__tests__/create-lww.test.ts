import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSpendtrackRepository } from '@/backend/repositories/spendtrack';

interface Result {
  data: unknown;
  error: unknown;
}

/**
 * PostgREST-shaped fake for the create-replay paths. `upsert_expense_lww` and
 * friends return `[]` when the stored row is newer (the SQL predicate filtered
 * the DO UPDATE) and the winning row when it applied. `results` scripts the
 * follow-up read that resolves the current row after a filtered replay.
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

  select(columns?: string) {
    return this.log(`select ${columns ?? '*'}`);
  }
  insert(rows: unknown) {
    return this.log(`insert ${JSON.stringify(rows)}`);
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

function makeClient(results: Record<string, Result> = {}, rpcResults: Record<string, Result> = {}) {
  const calls: string[] = [];
  const from = vi.fn(
    (table: string) =>
      new Builder(table, calls, () => results[table] ?? { data: null, error: null })
  );
  const rpc = vi.fn((name: string, args: unknown) => {
    calls.push(`rpc:${name} ${JSON.stringify(args)}`);
    return Promise.resolve(rpcResults[name] ?? { data: [], error: null });
  });
  return { client: { from, rpc } as unknown as SupabaseClient, calls };
}

const splitRows = (calls: string[]) => calls.filter((c) => c.startsWith('expense_splits:'));

const expenseInput = {
  user_id: 'u-1',
  amount: 10,
  category_id: 'c-1',
  date: '2026-10-10',
  description: null,
  clientId: '44444444-4444-7444-8444-444444444444',
  updatedAt: '2026-10-10T10:00:00.000Z',
  splits: [{ category_id: 'c-2', amount: 10 }],
};

describe('createExpense — splits follow the last-write-wins outcome', () => {
  it('a stale replay leaves the current row and splits untouched', async () => {
    const { client, calls } = makeClient(
      { expenses: { data: { id: 'e-existing' }, error: null } },
      { upsert_expense_lww: { data: [], error: null } }
    );
    const repo = createSpendtrackRepository(client);

    const expenseId = await repo.createExpense(expenseInput);

    expect(expenseId).toBe('e-existing');
    expect(calls.some((c) => c.startsWith('rpc:upsert_expense_lww'))).toBe(true);
    expect(calls.some((c) => c.startsWith('expenses:upsert'))).toBe(false);
    // The parent row lost the conflict, so its newer split allocation survives.
    expect(splitRows(calls)).toEqual([]);
  });

  it('an equal-or-newer replay still upserts and replaces the splits', async () => {
    const { client, calls } = makeClient(
      {},
      { upsert_expense_lww: { data: [{ id: 'e-1' }], error: null } }
    );
    const repo = createSpendtrackRepository(client);

    const expenseId = await repo.createExpense(expenseInput);

    expect(expenseId).toBe('e-1');
    const deleteIndex = calls.findIndex((c) => c === 'expense_splits:delete');
    const insertIndex = calls.findIndex((c) => c.startsWith('expense_splits:insert'));
    expect(deleteIndex).toBeGreaterThanOrEqual(0);
    expect(insertIndex).toBeGreaterThan(deleteIndex);
  });
});

describe('createRecurringExpense — last-write-wins on the replay', () => {
  const storedRow = {
    id: 'r-1',
    amount: 30,
    category_id: 'c-1',
    description: 'newer',
    day_of_month: 5,
    start_month: '2026-10',
    active: true,
    client_id: '55555555-5555-7555-8555-555555555555',
    updated_at: '2026-10-15T10:00:00.000Z',
    deleted_at: null,
  };

  it('returns the stored row when the replay is older', async () => {
    const { client, calls } = makeClient(
      { recurring_expenses: { data: storedRow, error: null } },
      { upsert_recurring_expense_lww: { data: [], error: null } }
    );
    const repo = createSpendtrackRepository(client);

    const result = await repo.createRecurringExpense('u-1', {
      amount: 10,
      category_id: 'c-1',
      description: 'older',
      day_of_month: 5,
      start_month: '2026-10',

      clientId: '55555555-5555-7555-8555-555555555555',
      updatedAt: '2026-10-10T10:00:00.000Z',
    });

    expect(result.description).toBe('newer');
    expect(result.updatedAt).toBe('2026-10-15T10:00:00.000Z');
    expect(calls.some((c) => c.includes('eq client_id=55555555-5555-7555-8555-555555555555'))).toBe(
      true
    );
  });

  it('returns the upserted row when the replay wins', async () => {
    const { client, calls } = makeClient(
      {},
      { upsert_recurring_expense_lww: { data: [storedRow], error: null } }
    );
    const repo = createSpendtrackRepository(client);

    const result = await repo.createRecurringExpense('u-1', {
      amount: 30,
      category_id: 'c-1',
      description: 'newer',
      day_of_month: 5,
      start_month: '2026-10',

      clientId: '55555555-5555-7555-8555-555555555555',
      updatedAt: '2026-10-15T10:00:00.000Z',
    });

    expect(result.id).toBe('r-1');
    expect(calls.some((c) => c.startsWith('recurring_expenses:upsert'))).toBe(false);
  });
});

describe('createCategory — last-write-wins on the replay', () => {
  it('a stale replay is a success no-op', async () => {
    const { client, calls } = makeClient({}, { upsert_category_lww: { data: [], error: null } });
    const repo = createSpendtrackRepository(client);

    await expect(
      repo.createCategory({
        user_id: 'u-1',
        name: 'طعام',
        colorHex: '#ff0000',
        clientId: '66666666-6666-7666-8666-666666666666',
        updatedAt: '2026-10-10T10:00:00.000Z',
      })
    ).resolves.toBeUndefined();

    expect(calls.some((c) => c.startsWith('rpc:upsert_category_lww'))).toBe(true);
    expect(calls.some((c) => c.startsWith('categories:upsert'))).toBe(false);
  });
});
