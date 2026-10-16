import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSpendtrackRepository } from '@/backend/repositories/spendtrack';

interface Result {
  data: unknown;
  error: unknown;
}

/**
 * Minimal PostgREST-shaped fake that records the builder chain so a test can
 * assert the exact row handed to `update()`. A leaked camelCase offline field
 * (e.g. `clientId`) makes PostgREST reject the write with PGRST204 — the bug
 * this guards against.
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
  eq(column: string, value: unknown) {
    return this.log(`eq ${column}=${String(value)}`);
  }
  is(column: string, value: unknown) {
    return this.log(`is ${column}=${String(value)}`);
  }
  or(filters: string) {
    return this.log(`or ${filters}`);
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

function makeClient() {
  const calls: string[] = [];
  const from = vi.fn(
    (table: string) => new Builder(table, calls, () => ({ data: null, error: null }))
  );
  return { client: { from } as unknown as SupabaseClient, calls };
}

describe('createSpendtrackRepository — offline write metadata never leaks to a row', () => {
  it('strips clientId from the expense update payload', async () => {
    const { client, calls } = makeClient();
    const repo = createSpendtrackRepository(client);

    await repo.updateExpense('e-1', 'u-1', {
      amount: 5,
      category_id: 'c-1',
      date: '2026-10-10',
      description: null,
      currency: null,
      clientId: '11111111-1111-7111-8111-111111111111',
      updatedAt: '2026-10-10T00:00:00.000Z',
    });

    const updateCall = calls.find((c) => c.includes('update'));
    expect(updateCall).toBeDefined();
    expect(updateCall).not.toContain('clientId');
    expect(updateCall).not.toContain('client_id');
    expect(updateCall).toContain('"amount":5');
    expect(updateCall).toContain('"updated_at":"2026-10-10T00:00:00.000Z"');
  });

  it('writes only the provided fields on a partial update', async () => {
    const { client, calls } = makeClient();
    const repo = createSpendtrackRepository(client);

    await repo.updateExpense('e-1', 'u-1', {
      description: 'غداء',
      updatedAt: '2026-10-10T00:00:00.000Z',
    });

    const updateCall = calls.find((c) => c.includes('update'));
    expect(updateCall).toBeDefined();
    expect(updateCall).toContain('"description":"غداء"');
    // An omitted field must not be written as `0`/`''`/`null` over the stored value.
    expect(updateCall).not.toContain('"amount"');
    expect(updateCall).not.toContain('"category_id"');
    expect(updateCall).not.toContain('"date"');
    expect(updateCall).not.toContain('"currency"');
  });

  it('guards a resurrect with last-write-wins on updated_at', async () => {
    const { client, calls } = makeClient();
    const repo = createSpendtrackRepository(client);
    const editAt = '2026-10-10T16:07:00.000Z';

    await repo.updateExpense('e-1', 'u-1', {
      amount: 1,
      category_id: 'c-1',
      date: '2026-10-10',
      description: null,
      updatedAt: editAt,
      deletedAt: null,
    });

    // A stale edit replayed after a newer delete must not revive the row: the
    // update only applies when it is not older than the row's last write, and
    // a resurrect skips the `deleted_at is null` filter.
    expect(calls.some((c) => c.includes(`lte updated_at=${editAt}`))).toBe(true);
    expect(calls.some((c) => c.includes('is deleted_at=null'))).toBe(false);
    expect(calls.find((c) => c.includes('update'))).toContain('"deleted_at":null');
  });

  it('a plain edit only touches live rows', async () => {
    const { client, calls } = makeClient();
    const repo = createSpendtrackRepository(client);
    const editAt = '2026-10-10T16:07:00.000Z';

    await repo.updateExpense('e-1', 'u-1', {
      amount: 1,
      category_id: 'c-1',
      date: '2026-10-10',
      description: null,
      updatedAt: editAt,
    });

    expect(calls.some((c) => c.includes('is deleted_at=null'))).toBe(true);
    expect(calls.some((c) => c.includes(`lte updated_at=${editAt}`))).toBe(true);
  });

  it('guards a delete with last-write-wins so an older replay is filtered', async () => {
    const { client, calls } = makeClient();
    const repo = createSpendtrackRepository(client);
    const deletedAt = '2026-10-10T16:07:20.000Z';

    await repo.deleteExpense('e-1', 'u-1', { updatedAt: deletedAt });

    expect(calls.some((c) => c.includes(`lte updated_at=${deletedAt}`))).toBe(true);
    expect(calls.find((c) => c.includes('update'))).toContain(`"deleted_at":"${deletedAt}"`);
  });

  it('strips clientId from the recurring expense update payload', async () => {
    const { client, calls } = makeClient();
    const repo = createSpendtrackRepository(client);

    await repo.updateRecurringExpense('r-1', 'u-1', {
      amount: 20,
      category_id: 'c-1',
      description: 'اشتراك',
      day_of_month: 5,
      start_month: '2026-10',
      clientId: '22222222-2222-7222-8222-222222222222',
      updatedAt: '2026-10-10T00:00:00.000Z',
    });

    const updateCall = calls.find((c) => c.includes('update'));
    expect(updateCall).toBeDefined();
    expect(updateCall).not.toContain('clientId');
    expect(updateCall).toContain('"amount":20');
  });
});
