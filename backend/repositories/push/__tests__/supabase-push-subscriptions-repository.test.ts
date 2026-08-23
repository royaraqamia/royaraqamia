import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createPushSubscriptionsRepository } from '@/backend/repositories/push/supabase-repository';

const { loggerWarn } = vi.hoisted(() => ({ loggerWarn: vi.fn() }));

vi.mock('@/backend/shared/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: loggerWarn,
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

type Row = Database['public']['Tables']['push_subscriptions']['Row'];

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'sub-1',
    user_id: 'u-1',
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    p256dh: 'p256',
    auth: 'auth',
    user_agent: 'Chrome/128',
    created_at: '2026-08-16T08:00:00.000Z',
    updated_at: '2026-08-16T08:00:00.000Z',
    ...overrides,
  };
}

function makeClient(
  overrides: {
    upsertError?: Error | null;
    selectError?: Error | null;
    deleteError?: Error | null;
    updateError?: Error | null;
    rows?: Row[];
  } = {}
) {
  const upsert = vi.fn().mockResolvedValue({ error: overrides.upsertError ?? null });
  const select = vi.fn();
  const resolveSelect = () =>
    Promise.resolve({ data: overrides.rows ?? [], error: overrides.selectError ?? null });
  const inSelect = vi.fn().mockImplementation(resolveSelect);
  const eqChain = {
    in: inSelect,
    then: (onFulfilled: (v: { data: Row[]; error: Error | null }) => void) => {
      onFulfilled({ data: overrides.rows ?? [], error: overrides.selectError ?? null });
      return Promise.resolve({ data: overrides.rows ?? [], error: overrides.selectError ?? null });
    },
  };
  const selectEq = vi.fn().mockReturnValue(eqChain);
  select.mockReturnValue({ eq: selectEq, in: inSelect });

  // Delete/update chains accept arbitrary .eq()/.neq() filters and record the
  // applied filter sequence so callers can assert exact scoping.
  const deleteFilters: string[][] = [];
  const updateFilters: string[][] = [];

  const filterStep = (filters: string[], terminalError: Error | null) => {
    type Step = {
      eq: ReturnType<typeof vi.fn>;
      neq: ReturnType<typeof vi.fn>;
      then: (onFulfilled: (v: { error: Error | null }) => void) => Promise<{ error: Error | null }>;
    };
    const step: Step = {
      eq: vi.fn((column: string, value: unknown) => {
        filters.push(`eq:${column}=${String(value)}`);
        return step;
      }),
      neq: vi.fn((column: string, value: unknown) => {
        filters.push(`neq:${column}=${String(value)}`);
        return step;
      }),
      then: (onFulfilled: (v: { error: Error | null }) => void) => {
        onFulfilled({ error: terminalError });
        return Promise.resolve({ error: terminalError });
      },
    };
    return step;
  };

  const deleteFn = vi.fn().mockImplementation(() => {
    const filters: string[] = [];
    deleteFilters.push(filters);
    return filterStep(filters, overrides.deleteError ?? null);
  });

  const updateFn = vi.fn().mockImplementation((payload: unknown) => {
    void payload;
    const filters: string[] = [];
    updateFilters.push(filters);
    return filterStep(filters, overrides.updateError ?? null);
  });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table !== 'push_subscriptions') throw new Error(`unexpected table: ${table}`);
    return { upsert, select, delete: deleteFn, update: updateFn };
  });

  const client = { from } as unknown as SupabaseClient<Database>;
  return {
    client,
    from,
    upsert,
    select,
    selectEq,
    inSelect,
    deleteFn,
    deleteFilters,
    updateFn,
    updateFilters,
  };
}

describe('createPushSubscriptionsRepository', () => {
  describe('upsert', () => {
    it('upserts on the endpoint conflict key with the owner user_id', async () => {
      const { client, upsert } = makeClient();
      const repo = createPushSubscriptionsRepository(client);

      await repo.upsert('u-1', {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        p256dh: 'p256',
        auth: 'auth',
        userAgent: 'Chrome/128',
      });

      expect(upsert).toHaveBeenCalledWith(
        {
          user_id: 'u-1',
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          p256dh: 'p256',
          auth: 'auth',
          user_agent: 'Chrome/128',
        },
        { onConflict: 'endpoint' }
      );
    });

    it('prunes superseded same-device rows after a successful upsert', async () => {
      const { client, deleteFilters } = makeClient();
      const repo = createPushSubscriptionsRepository(client);

      await repo.upsert('u-1', {
        endpoint: 'https://fcm.googleapis.com/fcm/send/new',
        p256dh: 'p256',
        auth: 'auth',
        userAgent: 'Chrome/140',
      });

      expect(deleteFilters).toEqual([
        [
          'eq:user_id=u-1',
          'eq:user_agent=Chrome/140',
          'neq:endpoint=https://fcm.googleapis.com/fcm/send/new',
        ],
      ]);
    });

    it('skips device cleanup when no user agent is available', async () => {
      const { client, deleteFilters } = makeClient();
      const repo = createPushSubscriptionsRepository(client);

      await repo.upsert('u-1', {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        p256dh: 'p256',
        auth: 'auth',
        userAgent: null,
      });

      expect(deleteFilters).toHaveLength(0);
    });

    it('keeps the subscription when the device cleanup fails (warn only)', async () => {
      const { client, deleteFilters } = makeClient({ deleteError: new Error('cleanup failed') });
      const repo = createPushSubscriptionsRepository(client);

      await expect(
        repo.upsert('u-1', {
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          p256dh: 'p256',
          auth: 'auth',
          userAgent: 'Chrome/128',
        })
      ).resolves.toBeUndefined();

      expect(deleteFilters).toHaveLength(1);
      expect(loggerWarn).toHaveBeenCalledWith(
        'Failed to prune superseded push subscriptions for device',
        expect.objectContaining({ userId: 'u-1' })
      );
    });

    it('throws when the upsert fails', async () => {
      const { client } = makeClient({ upsertError: new Error('upsert failed') });
      const repo = createPushSubscriptionsRepository(client);
      await expect(
        repo.upsert('u-1', {
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          p256dh: 'p256',
          auth: 'auth',
          userAgent: null,
        })
      ).rejects.toThrow('upsert failed');
    });
  });

  describe('findByUserId', () => {
    it('queries by user_id and maps rows to records', async () => {
      const { client, selectEq, inSelect } = makeClient({ rows: [makeRow()] });
      const repo = createPushSubscriptionsRepository(client);

      await expect(repo.findByUserId('u-1')).resolves.toEqual([
        {
          id: 'sub-1',
          userId: 'u-1',
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          p256dh: 'p256',
          auth: 'auth',
          userAgent: 'Chrome/128',
          createdAt: '2026-08-16T08:00:00.000Z',
          updatedAt: '2026-08-16T08:00:00.000Z',
        },
      ]);
      expect(selectEq).toHaveBeenCalledWith('user_id', 'u-1');
      expect(inSelect).not.toHaveBeenCalled();
    });

    it('returns an empty array when there are no rows', async () => {
      const { client } = makeClient({ rows: [] });
      const repo = createPushSubscriptionsRepository(client);
      await expect(repo.findByUserId('u-1')).resolves.toEqual([]);
    });
  });

  describe('findForUsers', () => {
    it('queries in chunks of 500 ids', async () => {
      const ids = Array.from({ length: 1050 }, (_, i) => `u-${i}`);
      const { client, inSelect } = makeClient({ rows: [makeRow()] });
      const repo = createPushSubscriptionsRepository(client);

      const records = await repo.findForUsers(ids);

      expect(inSelect).toHaveBeenCalledTimes(3);
      expect(inSelect.mock.calls.map((c) => c[1].length)).toEqual([500, 500, 50]);
      expect(records).toHaveLength(3);
    });

    it('throws when a chunked query fails', async () => {
      const { client } = makeClient({ selectError: new Error('db down') });
      const repo = createPushSubscriptionsRepository(client);
      await expect(repo.findForUsers(['u-1'])).rejects.toThrow('db down');
    });
  });

  describe('removeByEndpoint', () => {
    it('deletes scoped to the owner and endpoint', async () => {
      const { client, deleteFn, deleteFilters } = makeClient();
      const repo = createPushSubscriptionsRepository(client);

      await repo.removeByEndpoint('u-1', 'https://fcm.googleapis.com/fcm/send/abc');

      expect(deleteFn).toHaveBeenCalled();
      expect(deleteFilters[0]).toEqual([
        'eq:user_id=u-1',
        'eq:endpoint=https://fcm.googleapis.com/fcm/send/abc',
      ]);
    });

    it('throws when the delete fails', async () => {
      const { client } = makeClient({ deleteError: new Error('delete failed') });
      const repo = createPushSubscriptionsRepository(client);
      await expect(
        repo.removeByEndpoint('u-1', 'https://fcm.googleapis.com/fcm/send/abc')
      ).rejects.toThrow('delete failed');
    });
  });

  describe('removeEndpoint', () => {
    it('deletes by endpoint only (service-role prune)', async () => {
      const { client, deleteFn, deleteFilters } = makeClient();
      const repo = createPushSubscriptionsRepository(client);

      await repo.removeEndpoint('https://fcm.googleapis.com/fcm/send/abc');

      expect(deleteFn).toHaveBeenCalled();
      expect(deleteFilters[0]).toEqual(['eq:endpoint=https://fcm.googleapis.com/fcm/send/abc']);
    });

    it('throws when the delete fails', async () => {
      const { client } = makeClient({ deleteError: new Error('delete failed') });
      const repo = createPushSubscriptionsRepository(client);
      await expect(repo.removeEndpoint('https://fcm.googleapis.com/fcm/send/abc')).rejects.toThrow(
        'delete failed'
      );
    });
  });

  describe('touch', () => {
    it('refreshes updated_at scoped to the endpoint', async () => {
      const { client, updateFn, updateFilters } = makeClient();
      const repo = createPushSubscriptionsRepository(client);
      vi.useFakeTimers();

      try {
        await repo.touch('https://fcm.googleapis.com/fcm/send/abc');
        expect(updateFn).toHaveBeenCalledWith({
          updated_at: new Date().toISOString(),
        });
        expect(updateFilters[0]).toEqual(['eq:endpoint=https://fcm.googleapis.com/fcm/send/abc']);
      } finally {
        vi.useRealTimers();
      }
    });

    it('throws when the touch fails (service decides severity)', async () => {
      const { client } = makeClient({ updateError: new Error('touch failed') });
      const repo = createPushSubscriptionsRepository(client);
      await expect(repo.touch('https://fcm.googleapis.com/fcm/send/abc')).rejects.toThrow(
        'touch failed'
      );
    });
  });
});
