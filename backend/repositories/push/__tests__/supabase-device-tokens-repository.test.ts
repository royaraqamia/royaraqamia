import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createDevicePushTokensRepository } from '@/backend/repositories/push/supabase-device-tokens-repository';

type Row = Database['public']['Tables']['device_push_tokens']['Row'];

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'token-1',
    user_id: 'u-1',
    token: 'fMs6Q0abcDEF',
    platform: 'android',
    user_agent: 'Mozilla/5.0 (Linux; Android 14)',
    created_at: '2026-10-13T08:00:00.000Z',
    updated_at: '2026-10-13T08:00:00.000Z',
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
  const resolveSelect = () =>
    Promise.resolve({ data: overrides.rows ?? [], error: overrides.selectError ?? null });
  const inSelect = vi.fn().mockImplementation(resolveSelect);
  const selectEq = vi.fn().mockImplementation(resolveSelect);
  const select = vi.fn().mockReturnValue({ eq: selectEq, in: inSelect });

  const deleteFilters: string[][] = [];
  const deleteFn = vi.fn().mockImplementation(() => {
    const filters: string[] = [];
    deleteFilters.push(filters);
    const step: {
      eq: ReturnType<typeof vi.fn>;
      then: (onFulfilled: (v: { error: Error | null }) => void) => Promise<{ error: Error | null }>;
    } = {
      eq: vi.fn((column: string, value: unknown) => {
        filters.push(`eq:${column}=${String(value)}`);
        return step;
      }),
      then: (onFulfilled: (v: { error: Error | null }) => void) => {
        onFulfilled({ error: overrides.deleteError ?? null });
        return Promise.resolve({ error: overrides.deleteError ?? null });
      },
    };
    return step;
  });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table !== 'device_push_tokens') throw new Error(`unexpected table: ${table}`);
    return { upsert, select, delete: deleteFn };
  });

  const client = { from } as unknown as SupabaseClient<Database>;
  return { client, from, upsert, select, selectEq, inSelect, deleteFn, deleteFilters };
}

describe('createDevicePushTokensRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('upsert', () => {
    it('upserts on the token conflict key with the owner user_id', async () => {
      const { client, upsert } = makeClient();
      const repo = createDevicePushTokensRepository(client);

      await repo.upsert('u-1', {
        token: 'fMs6Q0abcDEF',
        platform: 'android',
        userAgent: 'Mozilla/5.0 (Linux; Android 14)',
      });

      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'u-1',
          token: 'fMs6Q0abcDEF',
          platform: 'android',
          user_agent: 'Mozilla/5.0 (Linux; Android 14)',
        }),
        { onConflict: 'token' }
      );
    });

    it('refreshes updated_at so a re-register is visible as liveness', async () => {
      const { client, upsert } = makeClient();
      const repo = createDevicePushTokensRepository(client);
      vi.useFakeTimers();

      try {
        await repo.upsert('u-1', { token: 't', platform: 'android', userAgent: null });
        expect(upsert).toHaveBeenCalledWith(
          expect.objectContaining({ updated_at: new Date().toISOString() }),
          { onConflict: 'token' }
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('throws when the upsert fails', async () => {
      const { client } = makeClient({ upsertError: new Error('upsert failed') });
      const repo = createDevicePushTokensRepository(client);

      await expect(
        repo.upsert('u-1', { token: 't', platform: 'android', userAgent: null })
      ).rejects.toThrow('upsert failed');
    });
  });

  describe('findByUserId', () => {
    it('queries by user_id and maps rows to records', async () => {
      const { client, selectEq } = makeClient({ rows: [makeRow()] });
      const repo = createDevicePushTokensRepository(client);

      await expect(repo.findByUserId('u-1')).resolves.toEqual([
        {
          id: 'token-1',
          userId: 'u-1',
          token: 'fMs6Q0abcDEF',
          platform: 'android',
          userAgent: 'Mozilla/5.0 (Linux; Android 14)',
          createdAt: '2026-10-13T08:00:00.000Z',
          updatedAt: '2026-10-13T08:00:00.000Z',
        },
      ]);
      expect(selectEq).toHaveBeenCalledWith('user_id', 'u-1');
    });

    it('returns an empty array when the user has no devices', async () => {
      const { client } = makeClient({ rows: [] });
      const repo = createDevicePushTokensRepository(client);
      await expect(repo.findByUserId('u-1')).resolves.toEqual([]);
    });

    it('throws when the query fails', async () => {
      const { client } = makeClient({ selectError: new Error('db down') });
      const repo = createDevicePushTokensRepository(client);
      await expect(repo.findByUserId('u-1')).rejects.toThrow('db down');
    });
  });

  describe('findForUsers', () => {
    it('queries in chunks of 500 ids', async () => {
      const ids = Array.from({ length: 1050 }, (_, i) => `u-${i}`);
      const { client, inSelect } = makeClient({ rows: [makeRow()] });
      const repo = createDevicePushTokensRepository(client);

      const records = await repo.findForUsers(ids);

      expect(inSelect).toHaveBeenCalledTimes(3);
      expect(inSelect.mock.calls.map((call) => call[1].length)).toEqual([500, 500, 50]);
      expect(records).toHaveLength(3);
    });

    it('does not query when there are no ids', async () => {
      const { client, inSelect } = makeClient();
      const repo = createDevicePushTokensRepository(client);
      await expect(repo.findForUsers([])).resolves.toEqual([]);
      expect(inSelect).not.toHaveBeenCalled();
    });
  });

  describe('removeByToken', () => {
    it('deletes scoped to the owner and the token', async () => {
      const { client, deleteFn, deleteFilters } = makeClient();
      const repo = createDevicePushTokensRepository(client);

      await repo.removeByToken('u-1', 'fMs6Q0abcDEF');

      expect(deleteFn).toHaveBeenCalled();
      expect(deleteFilters[0]).toEqual(['eq:user_id=u-1', 'eq:token=fMs6Q0abcDEF']);
    });

    it('throws when the delete fails', async () => {
      const { client } = makeClient({ deleteError: new Error('delete failed') });
      const repo = createDevicePushTokensRepository(client);
      await expect(repo.removeByToken('u-1', 't')).rejects.toThrow('delete failed');
    });
  });

  describe('removeToken', () => {
    it('deletes by token only (service-role prune)', async () => {
      const { client, deleteFilters } = makeClient();
      const repo = createDevicePushTokensRepository(client);

      await repo.removeToken('fMs6Q0abcDEF');

      expect(deleteFilters[0]).toEqual(['eq:token=fMs6Q0abcDEF']);
    });

    it('throws when the prune fails (service decides severity)', async () => {
      const { client } = makeClient({ deleteError: new Error('delete failed') });
      const repo = createDevicePushTokensRepository(client);
      await expect(repo.removeToken('t')).rejects.toThrow('delete failed');
    });
  });
});
