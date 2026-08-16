import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createPushSubscriptionsRepository } from '@/backend/repositories/push/supabase-repository';

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

  const deleteError = overrides.deleteError ?? null;
  const deleteDelete = vi.fn().mockResolvedValue({ error: deleteError });
  const deleteEq = vi.fn().mockReturnValue({
    eq: deleteDelete,
    then: (onFulfilled: (v: { error: Error | null }) => void) => {
      onFulfilled({ error: deleteError });
      return Promise.resolve({ error: deleteError });
    },
  });
  const deleteFn = vi.fn().mockReturnValue({ eq: deleteEq });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table !== 'push_subscriptions') throw new Error(`unexpected table: ${table}`);
    return { upsert, select, delete: deleteFn };
  });

  const client = { from } as unknown as SupabaseClient<Database>;
  return { client, from, upsert, select, selectEq, inSelect, deleteFn, deleteEq, deleteDelete };
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

    it('allows a null user agent', async () => {
      const { client, upsert } = makeClient();
      const repo = createPushSubscriptionsRepository(client);
      await repo.upsert('u-1', {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        p256dh: 'p256',
        auth: 'auth',
        userAgent: null,
      });
      expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ user_agent: null }), {
        onConflict: 'endpoint',
      });
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
      const { client, deleteFn, deleteEq, deleteDelete } = makeClient();
      const repo = createPushSubscriptionsRepository(client);

      await repo.removeByEndpoint('u-1', 'https://fcm.googleapis.com/fcm/send/abc');

      expect(deleteFn).toHaveBeenCalled();
      expect(deleteEq).toHaveBeenCalledWith('user_id', 'u-1');
      expect(deleteDelete).toHaveBeenCalledWith(
        'endpoint',
        'https://fcm.googleapis.com/fcm/send/abc'
      );
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
      const { client, deleteFn, deleteEq } = makeClient();
      const repo = createPushSubscriptionsRepository(client);

      await repo.removeEndpoint('https://fcm.googleapis.com/fcm/send/abc');

      expect(deleteFn).toHaveBeenCalled();
      expect(deleteEq).toHaveBeenCalledWith('endpoint', 'https://fcm.googleapis.com/fcm/send/abc');
    });

    it('throws when the delete fails', async () => {
      const { client } = makeClient({ deleteError: new Error('delete failed') });
      const repo = createPushSubscriptionsRepository(client);
      await expect(repo.removeEndpoint('https://fcm.googleapis.com/fcm/send/abc')).rejects.toThrow(
        'delete failed'
      );
    });
  });
});
