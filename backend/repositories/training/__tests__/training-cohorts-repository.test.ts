import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createTrainingCohortsRepository } from '@/backend/repositories/training/cohorts';
import { RepositoryError } from '@/backend/shared/repository-error';

vi.mock('@/backend/shared/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

const COHORT = {
  id: 'cohort-1',
  course_slug: 'build-digital-products',
  label: 'الدُّفعة الأولى',
  starts_at: '2026-11-01T00:00:00.000Z',
  capacity: 10,
  seats_taken: 3,
  status: 'open',
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
};

function makeClient(result: unknown) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const method of ['select', 'eq', 'order']) builder[method] = vi.fn(chain);
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.then = (onFulfilled: (value: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  const from = vi.fn(() => builder);
  const insert = vi.fn(chain);
  builder.insert = insert;
  builder.update = vi.fn(chain);
  return { client: { from } as unknown as SupabaseClient<Database>, builder };
}

const NO_ROWS = { message: 'no rows', code: 'PGRST116' };
const DB_ERROR = { message: 'db down', code: '08006' };

describe('training cohorts repository', () => {
  it('returns null from getById only when the row is genuinely absent', async () => {
    const { client } = makeClient({ data: null, error: NO_ROWS });
    const repo = createTrainingCohortsRepository(client);

    await expect(repo.getById('cohort-1')).resolves.toBeNull();
  });

  it('throws a RepositoryError from getById on a database error', async () => {
    const { client } = makeClient({ data: null, error: DB_ERROR });
    const repo = createTrainingCohortsRepository(client);

    await expect(repo.getById('cohort-1')).rejects.toBeInstanceOf(RepositoryError);
  });

  it('maps a cohort when the query succeeds', async () => {
    const { client } = makeClient({ data: COHORT, error: null });
    const repo = createTrainingCohortsRepository(client);

    await expect(repo.getById('cohort-1')).resolves.toEqual(COHORT);
  });

  it('resolves to an empty array when list has no rows', async () => {
    const { client } = makeClient({ data: [], error: null });
    const repo = createTrainingCohortsRepository(client);

    await expect(repo.list()).resolves.toEqual([]);
  });
});
