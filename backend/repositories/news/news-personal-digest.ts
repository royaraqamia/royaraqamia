import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import type { NewsPersonalDigestRepository } from '@/backend/repositories/news/news-personal-digest-repository';
import type { NewsCategory, NewsDay, NewsRegion, NewsStory } from '@/shared/contracts/news';

type UserDigestRow = Database['public']['Tables']['news_user_digests']['Row'];
type UserStoryRow = Database['public']['Tables']['news_user_stories']['Row'];

const STORY_COLUMNS =
  'id, position, category, region, headline_ar, summary_ar, why_it_matters_ar, source_id, source_name, source_url, source_published_at';

function mapStory(row: UserStoryRow): NewsStory {
  return {
    id: row.id,
    position: row.position,
    // The check constraints in 20261024160000 are the authority; the casts only
    // carry that fact through the untyped `text` columns.
    category: row.category as NewsCategory,
    region: row.region as NewsRegion,
    headline: row.headline_ar,
    summary: row.summary_ar,
    whyItMatters: row.why_it_matters_ar,
    sourceId: row.source_id,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    sourcePublishedAt: row.source_published_at,
  };
}

/**
 * Reads one reader's own digest.
 *
 * The `user_id` filter is not redundant beside RLS: the nightly writer reaches
 * this table with the service role, and the loader asks for a specific reader.
 */
export function createNewsPersonalDigestRepository(
  supabase: SupabaseClient<Database>
): NewsPersonalDigestRepository {
  async function withStories(digest: UserDigestRow): Promise<NewsDay> {
    const { data, error } = await supabase
      .from('news_user_stories')
      .select(STORY_COLUMNS)
      .eq('digest_id', digest.id)
      .order('position', { ascending: true });

    if (error) throw new Error(error.message);

    return {
      digest: {
        id: digest.id,
        date: digest.digest_date,
        title: digest.title,
        lede: digest.lede,
        storyCount: digest.story_count,
        model: digest.model,
        publishedAt: digest.published_at,
      },
      stories: (data ?? []).map((row) => mapStory(row as UserStoryRow)),
    };
  }

  return {
    async getLatest(userId: string): Promise<NewsDay | null> {
      const { data, error } = await supabase
        .from('news_user_digests')
        .select('*')
        .eq('user_id', userId)
        .order('digest_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data ? withStories(data) : null;
    },

    async getByDate(userId: string, date: string): Promise<NewsDay | null> {
      const { data, error } = await supabase
        .from('news_user_digests')
        .select('*')
        .eq('user_id', userId)
        .eq('digest_date', date)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data ? withStories(data) : null;
    },
  };
}
