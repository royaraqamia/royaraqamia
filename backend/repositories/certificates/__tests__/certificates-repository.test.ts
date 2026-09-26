import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createCertificatesRepository } from '@/backend/repositories/certificates';
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
  for (const method of ['select', 'eq', 'order', 'or', 'range', 'contains']) {
    builder[method] = vi.fn(chain);
  }
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.then = (onFulfilled: (value: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  const from = vi.fn(() => builder);
  return { client: { from } as unknown as SupabaseClient<Database> };
}

const CERTIFICATE = {
  id: 'cert-1',
  certificate_code: 'COMP-2026-ABCDEFGH',
  student_name: 'أحمد العلي',
  course_name: 'بناء المنتجات الرقمية',
  issue_date: '2026-01-01',
  expiration_date: null,
  grade_or_status: null,
  recipient_email: null,
  recipient_user_ids: [],
  created_by: null,
  created_at: '2026-01-01T00:00:00.000Z',
};

const DB_ERROR = { message: 'db down', code: '08006' };
const NO_ROWS = { message: 'no rows', code: 'PGRST116' };

describe('certificates repository failure contract', () => {
  it('throws a RepositoryError from getByCode on a database error', async () => {
    const repo = createCertificatesRepository(makeClient({ data: null, error: DB_ERROR }).client);

    await expect(repo.getByCode('COMP-2026-ABCDEFGH')).rejects.toBeInstanceOf(RepositoryError);
    expect(loggerError).toHaveBeenCalledTimes(1);
  });

  it('returns null from getByCode only when the row is genuinely absent', async () => {
    const repo = createCertificatesRepository(makeClient({ data: null, error: NO_ROWS }).client);

    await expect(repo.getByCode('COMP-2026-MISSING')).resolves.toBeNull();
  });

  it('returns the certificate from getByCode when found', async () => {
    const repo = createCertificatesRepository(
      makeClient({ data: CERTIFICATE, error: null }).client
    );

    await expect(repo.getByCode('COMP-2026-ABCDEFGH')).resolves.toEqual(CERTIFICATE);
  });

  it('throws from getById on a database error and returns null only on absence', async () => {
    const failing = createCertificatesRepository(
      makeClient({ data: null, error: DB_ERROR }).client
    );
    await expect(failing.getById('cert-1')).rejects.toBeInstanceOf(RepositoryError);

    const missing = createCertificatesRepository(makeClient({ data: null, error: NO_ROWS }).client);
    await expect(missing.getById('missing')).resolves.toBeNull();
  });

  it('throws from getCodes instead of returning an empty list', async () => {
    const repo = createCertificatesRepository(makeClient({ data: null, error: DB_ERROR }).client);

    await expect(repo.getCodes()).rejects.toBeInstanceOf(RepositoryError);
  });

  it('returns an empty list from getCodes only when there are no rows', async () => {
    const repo = createCertificatesRepository(makeClient({ data: null, error: null }).client);

    await expect(repo.getCodes()).resolves.toEqual([]);
  });

  it('throws from list instead of reporting an empty page', async () => {
    const repo = createCertificatesRepository(makeClient({ data: null, error: DB_ERROR }).client);

    await expect(repo.list(1, 20, '')).rejects.toBeInstanceOf(RepositoryError);
  });

  it('returns an empty page from list only when there are no rows', async () => {
    const repo = createCertificatesRepository(
      makeClient({ data: null, count: null, error: null }).client
    );

    await expect(repo.list(1, 20, '')).resolves.toEqual({ data: [], total: 0 });
  });

  it('throws from listByRecipient on a database error', async () => {
    const repo = createCertificatesRepository(makeClient({ data: null, error: DB_ERROR }).client);

    await expect(repo.listByRecipient('u-1')).rejects.toBeInstanceOf(RepositoryError);
  });
});
