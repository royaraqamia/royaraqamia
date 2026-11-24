import { getAdminSupabase } from '@/backend/config/supabase';
import { createCommentReportsAdminRepository } from '@/backend/repositories/community/comment-reports-admin-repository';
import { CommentReportsAdminService } from '@/backend/services/community/comment-reports-admin-service';

/** Service-role wiring: the Admin Console owes one list of every report. */
export function createDefaultCommentReportsAdminService(): CommentReportsAdminService {
  return new CommentReportsAdminService(createCommentReportsAdminRepository(getAdminSupabase()));
}
