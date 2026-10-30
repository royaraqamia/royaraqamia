import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import type { NewsUserSourcesRepository } from '@/backend/repositories/news/news-user-sources-repository';
import type {
  NewsCategory,
  NewsPrivateSource,
  NewsPrivateSourceStatus,
  NewsRegion,
  NewsSourceKind,
} from '@/shared/contracts/news';

type UserSourceRow = Pick<
  Database['public']['Tables']['news_user_sources']['Row'],
  | 'id'
  | 'name'
  | 'url'
  | 'kind'
  | 'category'
  | 'region'
  | 'status'
  | 'failure_count'
  | 'last_error'
  | 'last_checked_at'
  | 'created_at'
>;

const SOURCE_COLUMNS =
  'id, name, url, kind, category, region, status, failure_count, last_error, last_checked_at, created_at';

function mapSource(row: UserSourceRow): NewsPrivateSource {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    // The check constraints in 20261030150000 are the authority; the casts only
    // carry that fact through the untyped `text` columns.
    kind: row.kind as NewsSourceKind,
    category: row.category as NewsCategory,
    region: row.region as NewsRegion,
    status: row.status as NewsPrivateSourceStatus,
    failureCount: row.failure_count,
    lastError: row.last_error,
    lastCheckedAt: row.last_checked_at,
    createdAt: row.created_at,
  };
}

export function createNewsUserSourcesRepository(
  supabase: SupabaseClient<Database>
): NewsUserSourcesRepository {
  return {
    async list(userId: string): Promise<NewsPrivateSource[]> {
      const { data, error } = await supabase
        .from('news_user_sources')
        .select(SOURCE_COLUMNS)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => mapSource(row));
    },

    async count(userId: string): Promise<number> {
      const { count, error } = await supabase
        .from('news_user_sources')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (error) throw new Error(error.message);
      return count ?? 0;
    },

    async findIdByUrl(userId: string, url: string): Promise<string | null> {
      const { data, error } = await supabase
        .from('news_user_sources')
        .select('id')
        .eq('user_id', userId)
        .eq('url', url)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data?.id ?? null;
    },

    /**
     * Deleting is the reader's own row by policy, so a row that comes back empty
     * is either someone else's or already gone; the caller treats both as a 404.
     */
    async remove(userId: string, id: string): Promise<boolean> {
      const { data, error } = await supabase
        .from('news_user_sources')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
        .select('id');

      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },
  };
}
