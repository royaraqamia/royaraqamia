import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import type {
  ApproveNewsSourceRequest,
  NewNewsSourceRequest,
  NewsSourceRequestsRepository,
  RejectNewsSourceRequest,
} from '@/backend/repositories/news/news-source-requests-repository';
import type {
  NewsCategory,
  NewsRegion,
  NewsSourceRequest,
  NewsSourceRequestStatus,
} from '@/shared/contracts/news';

type RequestRow = Database['public']['Tables']['news_source_requests']['Row'];

const REQUEST_COLUMNS =
  'id, url, name, status, category, region, tier, note, created_at, reviewed_at, source_id';

function mapRequest(row: RequestRow): NewsSourceRequest {
  return {
    id: row.id,
    url: row.url,
    name: row.name,
    status: row.status as NewsSourceRequestStatus,
    category: (row.category ?? null) as NewsCategory | null,
    region: (row.region ?? null) as NewsRegion | null,
    tier: row.tier === 1 ? 1 : row.tier === 2 ? 2 : null,
    note: row.note,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    sourceId: row.source_id,
  };
}

export function createNewsSourceRequestsRepository(
  supabase: SupabaseClient<Database>
): NewsSourceRequestsRepository {
  return {
    async countPending(userId: string): Promise<number> {
      const { count, error } = await supabase
        .from('news_source_requests')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'pending');

      if (error) throw new Error(error.message);
      return count ?? 0;
    },

    async findPendingIdByUrl(url: string): Promise<string | null> {
      const { data, error } = await supabase
        .from('news_source_requests')
        .select('id')
        .eq('url', url)
        .eq('status', 'pending')
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data?.id ?? null;
    },

    async insert(input: NewNewsSourceRequest): Promise<NewsSourceRequest> {
      const { data, error } = await supabase
        .from('news_source_requests')
        .insert({
          user_id: input.userId,
          url: input.url,
          name: input.name,
          status: 'pending',
        })
        .select(REQUEST_COLUMNS)
        .single();

      if (error) throw new Error(error.message);
      return mapRequest(data as RequestRow);
    },

    async listForUser(userId: string, limit: number): Promise<NewsSourceRequest[]> {
      const { data, error } = await supabase
        .from('news_source_requests')
        .select(REQUEST_COLUMNS)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => mapRequest(row as RequestRow));
    },

    async listForAdmin(
      status: NewsSourceRequestStatus | null,
      limit: number
    ): Promise<NewsSourceRequest[]> {
      let query = supabase
        .from('news_source_requests')
        .select(REQUEST_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (status) query = query.eq('status', status);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => mapRequest(row as RequestRow));
    },

    async findById(id: string): Promise<NewsSourceRequest | null> {
      const { data, error } = await supabase
        .from('news_source_requests')
        .select(REQUEST_COLUMNS)
        .eq('id', id)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data ? mapRequest(data as RequestRow) : null;
    },

    async markApproved(input: ApproveNewsSourceRequest): Promise<void> {
      const { error } = await supabase
        .from('news_source_requests')
        .update({
          status: 'approved',
          category: input.category,
          region: input.region,
          tier: input.tier,
          note: input.note,
          reviewed_by: input.reviewedBy,
          reviewed_at: new Date().toISOString(),
          source_id: input.sourceId,
        })
        .eq('id', input.id);

      if (error) throw new Error(error.message);
    },

    async markRejected(input: RejectNewsSourceRequest): Promise<void> {
      const { error } = await supabase
        .from('news_source_requests')
        .update({
          status: 'rejected',
          note: input.note,
          reviewed_by: input.reviewedBy,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', input.id);

      if (error) throw new Error(error.message);
    },
  };
}
