import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { guardRepositoryMethods } from '@/backend/shared/repository-error';
import type { CommentReportStatus } from '@/shared/contracts/comment-reports';

type Row = Database['public']['Tables']['post_comment_reports']['Row'];

const COLUMNS = 'id, comment_id, post_id, reporter_id, reason, snapshot, status, created_at';

/** The Admin Console's report reads and the one status write. */
export interface CommentReportsAdminRepository {
  list(status: CommentReportStatus | null, limit: number): Promise<Row[]>;
  decide(id: string, status: 'reviewed' | 'dismissed'): Promise<Row | null>;
}

export function createCommentReportsAdminRepository(
  supabase: SupabaseClient<Database>
): CommentReportsAdminRepository {
  return guardRepositoryMethods<CommentReportsAdminRepository>({
    async list(status, limit) {
      let builder = supabase
        .from('post_comment_reports')
        .select(COLUMNS)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (status) builder = builder.eq('status', status);

      const { data, error } = await builder;
      if (error) throw error;
      return data ?? [];
    },

    async decide(id, status) {
      const { data, error } = await supabase.rpc('post_comment_reports_decide', {
        p_report_id: id,
        p_status: status,
      });
      if (error) throw error;
      if (!data?.[0]) return null;

      const { data: row, error: readError } = await supabase
        .from('post_comment_reports')
        .select(COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (readError) throw readError;
      return row ?? null;
    },
  });
}
