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
  /** The selected column list — the one thing a count must get right. */
  select: string | null;
  /** Whether the query asked PostgREST for a count without a body. */
  headOnly: boolean;
}

function makeClient(count: number, rows: { client_id: string }[] = []) {
  const queries: QueryRecord[] = [];

  function builder(record: QueryRecord) {
    const query = {
      select: (columns: string, options?: { count?: string; head?: boolean }) => {
        record.select = columns;
        record.headOnly = options?.head === true && options?.count === 'exact';
        return query;
      },
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
      const record: QueryRecord = { table, filters: [], select: null, headOnly: false };
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
    /**
     * The column the count selects. PostgREST answers a select on a column that
     * does not exist with 42703, which the cap check surfaced as a 500 — so the
     * assertion is against the table's real key, not just the table's name.
     * `short_links` is keyed by `code`; it has no `id` column (#518).
     */
    select: string;
    filters: string[];
  }[] = [
    {
      item: 'habits',
      table: 'habits',
      select: 'id',
      filters: ['eq:user_id=user-1', 'is:deleted_at=null'],
    },
    {
      item: 'expenses',
      table: 'expenses',
      select: 'id',
      filters: ['eq:user_id=user-1', 'is:deleted_at=null'],
    },
    {
      item: 'expense_categories',
      table: 'categories',
      select: 'id',
      filters: ['eq:user_id=user-1', 'is:deleted_at=null'],
    },
    {
      item: 'budgets',
      table: 'budgets',
      select: 'id',
      filters: ['eq:user_id=user-1', 'is:deleted_at=null'],
    },
    {
      item: 'short_links',
      table: 'short_links',
      select: 'code',
      filters: ['eq:user_id=user-1', 'is:deleted_at=null'],
    },
    {
      item: 'community_drafts',
      table: 'posts',
      select: 'id',
      filters: ['eq:author_id=user-1', 'is:deleted_at=null', 'in:status=draft,scheduled'],
    },
    {
      item: 'community_published',
      table: 'posts',
      select: 'id',
      filters: ['eq:author_id=user-1', 'is:deleted_at=null', 'eq:status=published'],
    },
    {
      item: 'community_tags',
      table: 'community_tags',
      select: 'id',
      filters: ['eq:user_id=user-1'],
    },
    {
      item: 'community_categories',
      table: 'community_categories',
      select: 'id',
      filters: ['eq:user_id=user-1'],
    },
    {
      item: 'quran_bookmarks',
      table: 'quran_bookmarks',
      select: 'id',
      filters: ['eq:user_id=user-1', 'is:deleted_at=null'],
    },
  ];

  for (const { item, table, select, filters } of cases) {
    it(`counts ${item} from ${table} by ${select}, without tombstones`, async () => {
      const { client, queries } = makeClient(7);

      await expect(new SupabaseUsageRepository(client).countOwned(item, 'user-1')).resolves.toBe(7);

      expect(queries).toEqual([{ table, filters, select, headOnly: true }]);
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
