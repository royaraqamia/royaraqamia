import type { CommentReportsAdminRepository } from '@/backend/repositories/community/comment-reports-admin-repository';
import {
  CommentReportSnapshotSchema,
  type CommentReportRow,
  type CommentReportStatus,
} from '@/shared/contracts/comment-reports';

/** The queue's rules: validate a frozen snapshot on the way out, decide once. */
export class CommentReportsAdminService {
  constructor(private readonly repository: CommentReportsAdminRepository) {}

  async list(status: CommentReportStatus | null): Promise<CommentReportRow[]> {
    const rows = await this.repository.list(status, 100);
    return rows.map((row) => ({
      id: row.id,
      commentId: row.comment_id,
      postId: row.post_id,
      reporterId: row.reporter_id,
      reason: row.reason as CommentReportRow['reason'],
      status: row.status as CommentReportStatus,
      createdAt: row.created_at,
      snapshot: CommentReportSnapshotSchema.parse(row.snapshot),
    }));
  }

  async decide(id: string, status: 'reviewed' | 'dismissed'): Promise<CommentReportRow | null> {
    const updated = await this.repository.decide(id, status);
    if (!updated) return null;
    return {
      id: updated.id,
      commentId: updated.comment_id,
      postId: updated.post_id,
      reporterId: updated.reporter_id,
      reason: updated.reason as CommentReportRow['reason'],
      status: updated.status as CommentReportStatus,
      createdAt: updated.created_at,
      snapshot: CommentReportSnapshotSchema.parse(updated.snapshot),
    };
  }
}
