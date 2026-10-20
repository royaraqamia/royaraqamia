import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createProjectRequestsRepository } from '@/backend/repositories/project-requests';
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
  data: unknown;
  error: unknown;
  count?: number | null;
}

const DB_ERROR = { message: 'db down', code: 'PGRST500' };
const NO_ROWS = { message: 'no rows', code: 'PGRST116' };

/**
 * One PostgREST-shaped builder that answers `.single()`/`.maybeSingle()` from
 * `single` and a plain await (the list query) from `list`.
 */
function makeClient(results: { single?: Result; list?: Result }) {
  class Builder {
    select() {
      return this;
    }
    order() {
      return this;
    }
    eq() {
      return this;
    }
    or() {
      return this;
    }
    range() {
      return this;
    }
    single() {
      return Promise.resolve(results.single ?? { data: null, error: null });
    }
    maybeSingle() {
      return Promise.resolve(results.single ?? { data: null, error: null });
    }
    then(
      onFulfilled?: ((value: Result) => unknown) | null,
      onRejected?: (reason: unknown) => unknown
    ) {
      return Promise.resolve(results.list ?? { data: [], error: null, count: 0 }).then(
        onFulfilled,
        onRejected
      );
    }
  }

  const from = vi.fn(() => new Builder());
  return { from } as unknown as SupabaseClient<Database>;
}

describe('project requests read failures (#404)', () => {
  it('rejects getById on a database error instead of reporting not-found', async () => {
    const repo = createProjectRequestsRepository(
      makeClient({ single: { data: null, error: DB_ERROR } })
    );

    await expect(repo.getById('pr-1')).rejects.toBeInstanceOf(RepositoryError);
    await expect(repo.getById('pr-1')).rejects.toMatchObject({ operation: 'getById' });
    expect(loggerError).toHaveBeenCalled();
  });

  it('returns null from getById only when no row matched', async () => {
    const repo = createProjectRequestsRepository(
      makeClient({ single: { data: null, error: NO_ROWS } })
    );

    await expect(repo.getById('missing')).resolves.toBeNull();
  });

  it('rejects list on a database error instead of returning an empty page', async () => {
    const repo = createProjectRequestsRepository(
      makeClient({ list: { data: null, error: DB_ERROR, count: null } })
    );

    await expect(repo.list({ page: 1, pageSize: 20 })).rejects.toMatchObject({
      operation: 'list',
    });
  });

  it('returns an empty page for a genuinely empty result set', async () => {
    const repo = createProjectRequestsRepository(
      makeClient({ list: { data: [], error: null, count: 0 } })
    );

    await expect(repo.list({ page: 1, pageSize: 20 })).resolves.toEqual({ data: [], total: 0 });
  });
});
