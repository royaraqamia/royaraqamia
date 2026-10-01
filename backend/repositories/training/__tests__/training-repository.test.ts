import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createTrainingApplicationsRepository } from '@/backend/repositories/training';
import {
  AlreadyEnrolledError,
  CohortClosedError,
  CohortFullError,
  CohortNotFoundError,
  NotEnrolledError,
} from '@/backend/repositories/training/training-applications-repository';
import { RepositoryError } from '@/backend/shared/repository-error';

const { loggerError, captureException } = vi.hoisted(() => ({
  loggerError: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@/backend/shared/logger', () => ({
  logger: { error: loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@sentry/nextjs', () => ({ captureException }));

function makeClient(result: unknown) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const method of ['select', 'eq', 'order', 'or', 'range']) {
    builder[method] = vi.fn(chain);
  }
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.then = (onFulfilled: (value: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  const from = vi.fn(() => builder);
  return { client: { from } as unknown as SupabaseClient<Database> };
}

const APPLICATION = {
  id: 'app-1',
  course_slug: 'build-digital-products',
  full_name: 'أحمد العلي',
  phone_whatsapp: '+963 968 478 904',
  goal: null,
  reference_code: 'TRN-2026-A7K2M9QX',
  user_id: null,
  status: 'new',
  notes: null,
  created_at: '2026-08-01T10:00:00.000Z',
  updated_at: '2026-08-01T10:00:00.000Z',
};

const DB_ERROR = { message: 'db down', code: '08006' };
const NO_ROWS = { message: 'no rows', code: 'PGRST116' };

describe('training repository failure contract', () => {
  it('throws a RepositoryError from getById on a database error', async () => {
    const repo = createTrainingApplicationsRepository(
      makeClient({ data: null, error: DB_ERROR }).client
    );

    await expect(repo.getById('app-1')).rejects.toBeInstanceOf(RepositoryError);
    expect(loggerError).toHaveBeenCalledTimes(1);
  });

  it('returns null from getById only when the row is genuinely absent', async () => {
    const repo = createTrainingApplicationsRepository(
      makeClient({ data: null, error: NO_ROWS }).client
    );

    await expect(repo.getById('missing')).resolves.toBeNull();
  });

  it('throws from getByReferenceCode instead of returning null', async () => {
    const repo = createTrainingApplicationsRepository(
      makeClient({ data: null, error: DB_ERROR }).client
    );

    await expect(repo.getByReferenceCode('TRN-2026-A7K2M9QX')).rejects.toBeInstanceOf(
      RepositoryError
    );
  });

  it('returns null from getByReferenceCode only when the row is absent', async () => {
    const repo = createTrainingApplicationsRepository(
      makeClient({ data: null, error: null }).client
    );

    await expect(repo.getByReferenceCode('TRN-2026-A7K2M9QX')).resolves.toBeNull();
  });

  it('throws from list instead of reporting an empty page', async () => {
    const repo = createTrainingApplicationsRepository(
      makeClient({ data: null, error: DB_ERROR }).client
    );

    await expect(repo.list({ page: 1, pageSize: 20 })).rejects.toBeInstanceOf(RepositoryError);
  });

  it('returns an empty page from list only when there are no rows', async () => {
    const repo = createTrainingApplicationsRepository(
      makeClient({ data: null, count: null, error: null }).client
    );

    await expect(repo.list({ page: 1, pageSize: 20 })).resolves.toEqual({ data: [], total: 0 });
  });

  it('maps a row when the query succeeds', async () => {
    const repo = createTrainingApplicationsRepository(
      makeClient({ data: APPLICATION, error: null }).client
    );

    await expect(repo.getById('app-1')).resolves.toEqual(APPLICATION);
  });
});

/**
 * The enroll/release RPCs raise plain error codes; the repository is the seam
 * that turns them into typed errors the controller maps to HTTP. A wrong mapping
 * here is a wrong status code on a scarce, business-critical write.
 */
describe('training repository enrollment error mapping', () => {
  function makeRpcClient(rpcResult: { data?: unknown; error?: unknown }) {
    const getByIdClient = makeClient({ data: APPLICATION, error: null }).client;
    const rpc = vi.fn(() => Promise.resolve(rpcResult));
    return {
      from: (getByIdClient as unknown as { from: (...args: unknown[]) => unknown }).from,
      rpc,
    } as unknown as SupabaseClient<Database>;
  }

  const cases: Array<[string, unknown]> = [
    ['COHORT_FULL', CohortFullError],
    ['COHORT_NOT_FOUND', CohortNotFoundError],
    ['COHORT_CLOSED', CohortClosedError],
    ['ALREADY_ENROLLED', AlreadyEnrolledError],
  ];

  it.each(cases)('maps enroll RPC %s to the typed error', async (code, expected) => {
    const client = makeRpcClient({ error: { message: code } });
    const repo = createTrainingApplicationsRepository(client);

    await expect(repo.enroll('app-1', 'cohort-1')).rejects.toBeInstanceOf(expected);
  });

  it('maps the release NOT_ENROLLED code to NotEnrolledError', async () => {
    const client = makeRpcClient({ error: { message: 'NOT_ENROLLED' } });
    const repo = createTrainingApplicationsRepository(client);

    await expect(repo.release('app-1', 'contacted', null)).rejects.toBeInstanceOf(NotEnrolledError);
  });

  it('re-reads the application after a successful enroll', async () => {
    const client = makeRpcClient({ data: 'app-1', error: null });
    const repo = createTrainingApplicationsRepository(client);

    await expect(repo.enroll('app-1', 'cohort-1')).resolves.toEqual(APPLICATION);
  });
});
