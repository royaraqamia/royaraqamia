import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { SupabaseUsageRepository } from '@/backend/repositories/plans/usage-repository';
import type { OwnedItemKey } from '@/shared/contracts/plans';

/**
 * A minimal shape of the PostgREST builder: `countOwned` only selects a count
 * (or a column list for connected apps), so the fake records what the repository
 * asked for and answers the count.
 */
interface QueryRecord {
  table: string;
  filters: string[];
}

function makeClient(count: number, rows: { client_id: string }[] = []) {
  const queries: QueryRecord[] = [];

  function builder(record: QueryRecord) {
    const query = {
      select: () => query,
      eq: (column: string, value: string) => {
        record.filters.push(`eq:${column}=${value}`);
        return query;
      },
      is: (column: string, value: null) => {
        record.filters.push(`is:${column}=${value}`);
        return query;
      },
      in: (column: string, values: string[]) => {
        record.filters.push(`in:${column}=${values.join(',')}`);
        return query;
      },
      gt: (column: string, _value: string) => {
        record.filters.push(`gt:${column}`);
        return query;
      },
      then: (resolve: (value: unknown) => unknown) => resolve({ count, error: null, data: rows }),
    };
    return query;
  }

  const client = {
    from: (table: string) => {
      const record: QueryRecord = { table, filters: [] };
      queries.push(record);
      return builder(record);
    },
  };

  return { client: client as unknown as SupabaseClient<Database>, queries };
}

describe('SupabaseUsageRepository.countOwned', () => {
  const cases: {
    item: OwnedItemKey;
    table: string;
    filters: string[];
  }[] = [
    { item: 'habits', table: 'habits', filters: ['eq:user_id=user-1', 'is:deleted_at=null'] },
    { item: 'expenses', table: 'expenses', filters: ['eq:user_id=user-1', 'is:deleted_at=null'] },
    {
      item: 'expense_categories',
      table: 'categories',
      filters: ['eq:user_id=user-1', 'is:deleted_at=null'],
    },
    { item: 'budgets', table: 'budgets', filters: ['eq:user_id=user-1', 'is:deleted_at=null'] },
    {
      item: 'short_links',
      table: 'short_links',
      filters: ['eq:user_id=user-1', 'is:deleted_at=null'],
    },
    {
      item: 'community_drafts',
      table: 'posts',
      filters: ['eq:author_id=user-1', 'is:deleted_at=null', 'in:status=draft,scheduled'],
    },
    {
      item: 'community_published',
      table: 'posts',
      filters: ['eq:author_id=user-1', 'is:deleted_at=null', 'eq:status=published'],
    },
    { item: 'community_tags', table: 'community_tags', filters: ['eq:user_id=user-1'] },
    {
      item: 'community_categories',
      table: 'community_categories',
      filters: ['eq:user_id=user-1'],
    },
    {
      item: 'quran_bookmarks',
      table: 'quran_bookmarks',
      filters: ['eq:user_id=user-1', 'is:deleted_at=null'],
    },
  ];

  for (const { item, table, filters } of cases) {
    it(`counts ${item} from ${table}, without tombstones`, async () => {
      const { client, queries } = makeClient(7);

      await expect(new SupabaseUsageRepository(client).countOwned(item, 'user-1')).resolves.toBe(7);

      expect(queries).toEqual([{ table, filters }]);
    });
  }

  it('counts connected apps by distinct client, not by token row', async () => {
    const { client, queries } = makeClient(3, [
      { client_id: 'a' },
      { client_id: 'a' },
      { client_id: 'b' },
    ]);

    await expect(
      new SupabaseUsageRepository(client).countOwned('mcp_connected_apps', 'user-1')
    ).resolves.toBe(2);

    expect(queries[0]?.table).toBe('mcp_oauth_tokens');
    expect(queries[0]?.filters).toEqual([
      'eq:user_id=user-1',
      'is:revoked_at=null',
      'gt:expires_at',
    ]);
  });
});
