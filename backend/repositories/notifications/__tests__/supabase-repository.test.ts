import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createSupabaseNotificationRepository } from '@/backend/repositories/notifications/supabase-repository';
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
  for (const method of ['select', 'eq', 'order', 'range', 'update', 'insert', 'delete']) {
    builder[method] = vi.fn(chain);
  }
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.then = (onFulfilled: (value: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  const from = vi.fn(() => builder);
  return { client: { from } as unknown as SupabaseClient<Database>, from, builder };
}

const ROW = {
  id: 'n-1',
  user_id: 'u-1',
  type: 'system_announcement',
  title: 'عنوان',
  body: null,
  metadata: null,
  is_read: false,
  created_at: '2026-08-01T10:00:00.000Z',
  read_at: null,
};

const DB_ERROR = { message: 'db down', code: '08006' };

describe('createSupabaseNotificationRepository failure contract', () => {
  it('throws a RepositoryError from findByUserId instead of returning an empty list', async () => {
    const { client } = makeClient({ data: null, error: DB_ERROR });
    const repo = createSupabaseNotificationRepository(client);

    await expect(repo.findByUserId('u-1')).rejects.toBeInstanceOf(RepositoryError);
    expect(loggerError).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('throws from findUnreadCount instead of returning zero', async () => {
    const { client } = makeClient({ count: null, error: DB_ERROR });
    const repo = createSupabaseNotificationRepository(client);

    await expect(repo.findUnreadCount('u-1')).rejects.toBeInstanceOf(RepositoryError);
  });

  it('throws from create instead of returning null', async () => {
    const { client } = makeClient({ data: null, error: DB_ERROR });
    const repo = createSupabaseNotificationRepository(client);

    await expect(
      repo.create({ user_id: 'u-1', type: 'system_announcement', title: 'عنوان' })
    ).rejects.toBeInstanceOf(RepositoryError);
  });

  it('throws from broadcast instead of reporting zero sent', async () => {
    const { client } = makeClient({ data: null, error: DB_ERROR });
    const repo = createSupabaseNotificationRepository(client);

    await expect(
      repo.broadcast({ type: 'system_announcement', title: 'عنوان' }, ['u-1'])
    ).rejects.toBeInstanceOf(RepositoryError);
  });

  it('throws from markAsRead instead of silently ignoring the failure', async () => {
    const { client } = makeClient({ error: DB_ERROR });
    const repo = createSupabaseNotificationRepository(client);

    await expect(repo.markAsRead('n-1', 'u-1')).rejects.toBeInstanceOf(RepositoryError);
  });

  it('throws from markAllAsRead instead of silently ignoring the failure', async () => {
    const { client } = makeClient({ error: DB_ERROR });
    const repo = createSupabaseNotificationRepository(client);

    await expect(repo.markAllAsRead('u-1')).rejects.toBeInstanceOf(RepositoryError);
  });

  it('throws from delete instead of silently ignoring the failure', async () => {
    const { client } = makeClient({ error: DB_ERROR });
    const repo = createSupabaseNotificationRepository(client);

    await expect(repo.delete('n-1', 'u-1')).rejects.toBeInstanceOf(RepositoryError);
  });

  it('keeps null (not a failure) meaningful for create and empty for reads', async () => {
    const { client } = makeClient({ data: null, count: null, error: null });
    const repo = createSupabaseNotificationRepository(client);

    await expect(repo.findByUserId('u-1')).resolves.toEqual([]);
    await expect(repo.findUnreadCount('u-1')).resolves.toBe(0);
  });

  it('maps rows when the query succeeds', async () => {
    const { client } = makeClient({ data: [ROW], error: null });
    const repo = createSupabaseNotificationRepository(client);

    await expect(repo.findByUserId('u-1')).resolves.toHaveLength(1);
  });
});
