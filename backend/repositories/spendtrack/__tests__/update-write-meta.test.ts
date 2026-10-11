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
