import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import type {
  ApprovedNewsSource,
  NewApprovedNewsSource,
  NewsSourcesRepository,
} from '@/backend/repositories/news/news-sources-repository';
import type { NewsCategory, NewsRegion, NewsSource } from '@/shared/contracts/news';

type SourceRow = Pick<
  Database['public']['Tables']['news_sources']['Row'],
  'id' | 'name' | 'url' | 'category' | 'region' | 'tier'
>;

const SOURCE_COLUMNS = 'id, name, url, category, region, tier';

function mapSource(row: SourceRow): ApprovedNewsSource {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    // The check constraints in 20261024140000 are the authority; the casts only
    // carry that fact through the untyped `text` columns.
    category: row.category as NewsCategory,
    region: row.region as NewsRegion,
    tier: row.tier === 2 ? 2 : 1,
  };
}

function toNewsSource(source: ApprovedNewsSource): NewsSource {
  return {
    id: source.id,
    name: source.name,
    category: source.category,
    region: source.region,
    tier: source.tier,
  };
}

export function createNewsSourcesRepository(
  supabase: SupabaseClient<Database>
): NewsSourcesRepository {
  return {
    async listEnabled(): Promise<NewsSource[]> {
      const { data, error } = await supabase
        .from('news_sources')
        .select(SOURCE_COLUMNS)
        .eq('enabled', true)
        .order('name', { ascending: true });

      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => toNewsSource(mapSource(row)));
    },

    async findIdByUrl(url: string): Promise<string | null> {
      const { data, error } = await supabase
        .from('news_sources')
        .select('id')
        .eq('url', url)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data?.id ?? null;
    },

    async findById(id: string): Promise<NewsSource | null> {
      const { data, error } = await supabase
        .from('news_sources')
        .select(SOURCE_COLUMNS)
        .eq('id', id)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data ? toNewsSource(mapSource(data)) : null;
    },

    async insert(source: NewApprovedNewsSource): Promise<void> {
      const { error } = await supabase.from('news_sources').insert({
        id: source.id,
        name: source.name,
        url: source.url,
        category: source.category,
        region: source.region,
        tier: source.tier,
        approved_by: source.approvedBy,
        request_id: source.requestId,
      });

      if (error) throw new Error(error.message);
    },
  };
}
