import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createSpendtrackRepository } from '@/backend/repositories/spendtrack';

interface Result {
  data: unknown;
  error: unknown;
}

type Row = Record<string, unknown>;

/**
 * Minimal PostgREST-shaped fake that applies `gt` filters to the table data, so
 * a snapshot page really is "rows newer than `since`" rather than whatever the
 * fixture contains.
 */
class Builder {
  private readonly gtFilters: Array<[column: string, value: string]> = [];

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
    return this.log(`select ${columns ?? ''}`);
  }
  or(expression: string) {
    return this.log(`or ${expression}`);
  }
  eq(column: string, value: unknown) {
    return this.log(`eq ${column}=${String(value)}`);
  }
  gt(column: string, value: string) {
    this.gtFilters.push([column, value]);
    return this.log(`gt ${column}>${value}`);
  }
  in(column: string, values: unknown[]) {
    return this.log(`in ${column}=${values.length}`);
  }
  is(column: string, value: unknown) {
    return this.log(`is ${column}=${String(value)}`);
  }

  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    const result = this.result();
    const data = Array.isArray(result.data)
      ? result.data.filter((row) =>
          this.gtFilters.every(([column, value]) => String((row as Row)[column] ?? '') > value)
        )
      : result.data;
    return Promise.resolve({ ...result, data }).then(onfulfilled, onrejected);
  }
}

function makeClient(tables: Record<string, Result>) {
  const calls: string[] = [];
  const from = (table: string) =>
    new Builder(table, calls, () => tables[table] ?? { data: [], error: null });
  return { client: { from } as unknown as SupabaseClient<Database>, calls };
}

const T5 = '2026-10-10T00:00:00.000Z';
const T20 = '2026-10-10T02:00:00.000Z';

const editedOnAnotherDevice = {
  id: 'e-1',
  client_id: 'e-1',
  user_id: 'u-1',
  category_id: 'c-1',
  amount: 42,
  description: null,
  date: '2026-10-09',
  currency: null,
  created_at: T5,
  updated_at: T20,
  server_updated_at: T20,
  deleted_at: null,
};

describe('getSyncSnapshot incremental page (#313)', () => {
  it('returns the row when the client keeps the cursor it had before skipping it', async () => {
    const { client, calls } = makeClient({
      expenses: { data: [editedOnAnotherDevice], error: null },
    });
    const repo = createSpendtrackRepository(client);

    const page = await repo.getSyncSnapshot('u-1', T5);

    expect(page.expenses.map((row) => row.id)).toEqual(['e-1']);
    expect(page.cursor).toBe(T20);
    expect(calls).toContain(`expenses:gt server_updated_at>${T5}`);
  });

  it('drops the row once the cursor has passed its server stamp', async () => {
    // Why #313 was permanent: `since` = the skipped row's stamp excludes it.
    const { client } = makeClient({
      expenses: { data: [editedOnAnotherDevice], error: null },
    });
    const repo = createSpendtrackRepository(client);

    const page = await repo.getSyncSnapshot('u-1', T20);

    expect(page.expenses).toEqual([]);
    expect(page.cursor).toBe(T20);
  });
});
