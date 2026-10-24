import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '@/backend/models/database.types';
import type {
  NewsCategory,
  NewsRegion,
  NewsRepository,
  SearchStoriesInput,
  StoredDigest,
  StoredStory,
  StoryWithDay,
} from '@/backend/repositories/news/news-repository';

type DigestRow = Tables<'news_digests'>;
type StoryRow = Tables<'news_stories'>;

/** The columns a story read selects; `created_at` is never read by the page. */
type StorySelectRow = Pick<
  StoryRow,
  | 'id'
  | 'digest_id'
  | 'position'
  | 'category'
  | 'region'
  | 'headline_ar'
  | 'summary_ar'
  | 'why_it_matters_ar'
  | 'source_id'
  | 'source_name'
  | 'source_url'
  | 'source_published_at'
>;

/** Columns a story read needs; kept in one place for the day and search reads. */
const STORY_COLUMNS =
  'id, digest_id, position, category, region, headline_ar, summary_ar, why_it_matters_ar, source_id, source_name, source_url, source_published_at';

function mapDigest(row: DigestRow): StoredDigest {
  return {
    id: row.id,
    date: row.digest_date,
    title: row.title,
    lede: row.lede,
    storyCount: row.story_count,
    model: row.model,
    publishedAt: row.published_at,
  };
}

function mapStory(row: StorySelectRow): StoredStory {
  return {
    id: row.id,
    position: row.position,
    // The check constraints in 20261023130000 are the authority; the casts only
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

export function createNewsRepository(supabase: SupabaseClient<Database>): NewsRepository {
  return {
    async getLatestDigest(): Promise<StoredDigest | null> {
      const { data, error } = await supabase
        .from('news_digests')
        .select('*')
        .order('digest_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapDigest(data) : null;
    },

    async getDigestByDate(date: string): Promise<StoredDigest | null> {
      const { data, error } = await supabase
        .from('news_digests')
        .select('*')
        .eq('digest_date', date)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapDigest(data) : null;
    },

    async listStories(digestId: string, category: NewsCategory | null): Promise<StoredStory[]> {
      let query = supabase
        .from('news_stories')
        .select(STORY_COLUMNS)
        .eq('digest_id', digestId)
        .order('position', { ascending: true });

      if (category) query = query.eq('category', category);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapStory);
    },

    async listDigestDates(limit: number): Promise<string[]> {
      const { data, error } = await supabase
        .from('news_digests')
        .select('digest_date')
        .order('digest_date', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => row.digest_date);
    },

    async searchStories(input: SearchStoriesInput): Promise<StoryWithDay[]> {
      const pattern = `%${input.query}%`;
      let query = supabase
        .from('news_stories')
        .select(`${STORY_COLUMNS}, news_digests!inner (digest_date)`)
        .order('source_published_at', { ascending: false, nullsFirst: false })
        .limit(input.limit);

      if (input.category) query = query.eq('category', input.category);

      // The trigram GIN in 20261023130000 is what makes this a reasonable query
      // over the retained month; `sanitizeNewsQuery` is what keeps the filter
      // syntax intact.
      const { data, error } = await query.or(
        `headline_ar.ilike.${pattern},summary_ar.ilike.${pattern}`
      );
      if (error) throw new Error(error.message);

      return (data ?? []).flatMap((row) => {
        const joined = row.news_digests;
        const digest = Array.isArray(joined) ? joined[0] : joined;
        if (!digest) return [];
        return [{ ...mapStory(row), digestDate: digest.digest_date }];
      });
    },

    async listRecentSourceUrls(sinceIso: string): Promise<string[]> {
      const { data, error } = await supabase
        .from('news_stories')
        .select('source_url')
        .gte('created_at', sinceIso);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => row.source_url);
    },
  };
}
