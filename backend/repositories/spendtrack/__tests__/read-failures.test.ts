import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createSpendtrackRepository } from '@/backend/repositories/spendtrack';
import type { SpendtrackRepository } from '@/backend/repositories/spendtrack/spendtrack-repository';
import { RepositoryError } from '@/backend/shared/repository-error';

const { loggerError, captureException } = vi.hoisted(() => ({
  loggerError: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@/backend/shared/logger', () => ({
  logger: { error: loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@sentry/nextjs', () => ({ captureException }));

interface Result {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

const DB_ERROR = { message: 'db down', code: 'PGRST500' };
const NO_ROWS = { message: 'no rows', code: 'PGRST116' };

const EVERY_TABLE_FAILING: Record<string, Result> = {
  categories: { data: null, error: DB_ERROR },
  expenses: { data: null, error: DB_ERROR },
  budgets: { data: null, error: DB_ERROR },
  recurring_expenses: { data: null, error: DB_ERROR },
  expense_splits: { data: null, error: DB_ERROR },
};

/** PostgREST-shaped fake: every table answers from `results`, `rpc` from its own. */
function makeClient(results: Record<string, Result> = {}, rpcResult: Result = { data: null }) {
  const answer = (table: string) => () => results[table] ?? { data: [], error: null };

  class Builder {
    constructor(private readonly result: () => Result) {}
    select() {
      return this;
    }
    or() {
      return this;
    }
    is() {
      return this;
    }
    in() {
      return this;
    }
    gt() {
      return this;
    }
    gte() {
      return this;
    }
    lte() {
      return this;
    }
    eq() {
      return this;
    }
    ilike() {
      return this;
    }
    order() {
      return this;
    }
    limit() {
      return this;
    }
    range() {
      return this;
    }
    single() {
      return Promise.resolve(this.result());
    }
    maybeSingle() {
      return Promise.resolve(this.result());
    }
    then(
      onFulfilled?: ((value: Result) => unknown) | null,
      onRejected?: (reason: unknown) => unknown
    ) {
      return Promise.resolve(this.result()).then(onFulfilled, onRejected);
    }
  }

  const from = vi.fn((table: string) => new Builder(answer(table)));
  const rpc = vi.fn(async () => rpcResult);
  return { client: { from, rpc } as unknown as SupabaseClient<Database> };
}

type Read = (repo: SpendtrackRepository) => Promise<unknown>;

const reads: Array<[string, Read]> = [
  ['getUserCategories', (repo) => repo.getUserCategories('u-1')],
  ['getSyncSnapshot', (repo) => repo.getSyncSnapshot('u-1')],
  ['getTotalExpenses', (repo) => repo.getTotalExpenses('u-1', '2026-01-01', '2026-01-31', null)],
  [
    'getCategoryBreakdown',
    (repo) => repo.getCategoryBreakdown('u-1', '2026-01-01', '2026-01-31', null),
  ],
  ['getDailyTotals', (repo) => repo.getDailyTotals('u-1', '2026-01-01', '2026-01-31', null)],
  [
    'getTransactions',
    (repo) =>
      repo.getTransactions({
        userId: 'u-1',
        start: '2026-01-01',
        end: '2026-01-31',
        filterCategories: [],
        sort: 'date_desc',
        pageSize: 10,
      }),
  ],
  ['getAllExpenses', (repo) => repo.getAllExpenses('u-1', '2026-01-01', '2026-01-31', null)],
  ['getBudget', (repo) => repo.getBudget('u-1', '2026-01')],
  ['getBudgets', (repo) => repo.getBudgets('u-1', '2026-01')],
];

describe('spendtrack read failures (#404)', () => {
  it.each(reads)(
    'rejects %s on a database error instead of returning empty data',
    async (operation, call) => {
      const repo = createSpendtrackRepository(
        makeClient(EVERY_TABLE_FAILING, { data: null, error: DB_ERROR }).client
      );

      const result = call(repo);

      await expect(result).rejects.toBeInstanceOf(RepositoryError);
      await expect(result).rejects.toMatchObject({ operation });
      expect(loggerError).toHaveBeenCalled();
    }
  );

  it('throws from getSyncSnapshot when a single sub-query fails', async () => {
    const repo = createSpendtrackRepository(
      makeClient({
        categories: { data: [{ id: 'c-1', color_hex: '#fff' }], error: null },
        budgets: { data: null, error: DB_ERROR },
      }).client
    );

    await expect(repo.getSyncSnapshot('u-1', '2026-01-01T00:00:00.000Z')).rejects.toMatchObject({
      operation: 'getSyncSnapshot',
    });
  });

  it('throws from getSyncSnapshot when the split lookup fails', async () => {
    const repo = createSpendtrackRepository(
      makeClient({
        expenses: { data: [{ id: 'e-1', server_updated_at: '2026-01-02T00:00:00.000Z' }] },
        expense_splits: { data: null, error: DB_ERROR },
      }).client
    );

    await expect(repo.getSyncSnapshot('u-1')).rejects.toBeInstanceOf(RepositoryError);
  });

  it('returns an empty snapshot at the previous cursor when every query succeeds', async () => {
    const repo = createSpendtrackRepository(makeClient().client);

    await expect(repo.getSyncSnapshot('u-1', '2026-01-01T00:00:00.000Z')).resolves.toEqual({
      categories: [],
      expenses: [],
      budgets: [],
      recurring: [],
      cursor: '2026-01-01T00:00:00.000Z',
    });
  });

  it('returns null from getBudget only when no row matched', async () => {
    const repo = createSpendtrackRepository(
      makeClient({ budgets: { data: null, error: NO_ROWS } }).client
    );

    await expect(repo.getBudget('u-1', '2026-01')).resolves.toBeNull();
  });

  it('returns empty arrays for a genuinely empty result set', async () => {
    const repo = createSpendtrackRepository(makeClient().client);

    await expect(repo.getUserCategories('u-1')).resolves.toEqual([]);
    await expect(repo.getBudgets('u-1', '2026-01')).resolves.toEqual([]);
    await expect(repo.getAllExpenses('u-1', '2026-01-01', '2026-01-31', null)).resolves.toEqual([]);
  });

  it('returns zero from getTotalExpenses when the RPC has no rows', async () => {
    const repo = createSpendtrackRepository(makeClient({}, { data: 0, error: null }).client);

    await expect(repo.getTotalExpenses('u-1', '2026-01-01', '2026-01-31', null)).resolves.toBe(0);
  });
});
