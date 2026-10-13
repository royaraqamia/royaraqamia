import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSpendtrackRepository } from '@/backend/repositories/spendtrack';

interface Result {
  data: unknown;
  error: unknown;
}

/**
 * PostgREST-shaped fake. The guarded `expenses` update reports the rows it
 * matched through `.select('id')`; `matchedRows` drives that return so a test
 * can model a stale replay (filtered by LWW → `[]`) versus a write that applied
 * (`[{ id }]`). All other tables resolve to `{ data: null, error: null }`.
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

  update(row: unknown) {
    return this.log(`update ${JSON.stringify(row)}`);
  }
  delete() {
    return this.log('delete');
  }
  insert(rows: unknown) {
    return this.log(`insert ${JSON.stringify(rows)}`);
  }
  eq(column: string, value: unknown) {
    return this.log(`eq ${column}=${String(value)}`);
  }
  is(column: string, value: unknown) {
    return this.log(`is ${column}=${String(value)}`);
  }
  lte(column: string, value: unknown) {
    return this.log(`lte ${column}=${String(value)}`);
  }
  select(columns: string) {
    return this.log(`select ${columns}`);
  }
  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.result()).then(onfulfilled, onrejected);
  }
}

function makeClient(matchedRows: unknown[] | null) {
  const calls: string[] = [];
  const from = vi.fn((table: string) => {
    const result: () => Result =
      table === 'expenses'
        ? () => ({ data: matchedRows, error: null })
        : () => ({ data: null, error: null });
    return new Builder(table, calls, result);
  });
  return { client: { from } as unknown as SupabaseClient, calls };
}

const splitRows = (calls: string[]) => calls.filter((c) => c.startsWith('expense_splits:'));

const baseInput = {
  amount: 10,
  category_id: 'c-1',
  date: '2026-10-10',
  description: null,
  currency: null,
};

describe('updateExpense — splits follow the last-write-wins outcome', () => {
  it('a stale replay leaves the current split set untouched', async () => {
    // The LWW predicate filtered the row write (`.select('id')` → `[]`), so the
    // stale edit's splits must not replace the newer allocation (ticket #188).
    const { client, calls } = makeClient([]);
    const repo = createSpendtrackRepository(client);

    await repo.updateExpense('e-1', 'u-1', {
      ...baseInput,
      updatedAt: '2026-10-10T10:00:00.000Z',
      splits: [{ category_id: 'c-2', amount: 10 }],
    });

    expect(calls.some((c) => c.startsWith('expenses:') && c.includes('select id'))).toBe(true);
    expect(splitRows(calls)).toEqual([]);
  });

  it('a stale replay with null splits does not clear the current splits', async () => {
    const { client, calls } = makeClient([]);
    const repo = createSpendtrackRepository(client);

    await repo.updateExpense('e-1', 'u-1', {
      ...baseInput,
      updatedAt: '2026-10-10T10:00:00.000Z',
      splits: null,
    });

    expect(splitRows(calls)).toEqual([]);
  });

  it('an applied write still replaces the set (delete-all then insert)', async () => {
    const { client, calls } = makeClient([{ id: 'e-1' }]);
    const repo = createSpendtrackRepository(client);

    await repo.updateExpense('e-1', 'u-1', {
      ...baseInput,
      updatedAt: '2026-10-10T12:00:00.000Z',
      splits: [
        { category_id: 'c-2', amount: 4 },
        { category_id: 'c-3', amount: 6, clientId: '33333333-3333-7333-8333-333333333333' },
      ],
    });

    const deleteIndex = calls.findIndex((c) => c === 'expense_splits:delete');
    const insertIndex = calls.findIndex((c) => c.startsWith('expense_splits:insert'));
    expect(deleteIndex).toBeGreaterThanOrEqual(0);
    expect(insertIndex).toBeGreaterThan(deleteIndex);
    const insert = calls[insertIndex];
    expect(insert).toContain('"expense_id":"e-1"');
    expect(insert).toContain('"amount":4');
    expect(insert).toContain('"amount":6');
    expect(insert).toContain('33333333-3333-7333-8333-333333333333');
  });

  it('an applied write with null splits clears the set', async () => {
    const { client, calls } = makeClient([{ id: 'e-1' }]);
    const repo = createSpendtrackRepository(client);

    await repo.updateExpense('e-1', 'u-1', {
      ...baseInput,
      updatedAt: '2026-10-10T12:00:00.000Z',
      splits: null,
    });

    const splitOps = splitRows(calls);
    expect(splitOps).toEqual(['expense_splits:delete', 'expense_splits:eq expense_id=e-1']);
    expect(splitOps.some((c) => c.includes('insert'))).toBe(false);
  });

  it('omits the split block entirely when splits are undefined', async () => {
    const { client, calls } = makeClient([{ id: 'e-1' }]);
    const repo = createSpendtrackRepository(client);

    await repo.updateExpense('e-1', 'u-1', {
      ...baseInput,
      updatedAt: '2026-10-10T12:00:00.000Z',
    });

    expect(splitRows(calls)).toEqual([]);
  });
});
