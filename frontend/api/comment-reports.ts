import { request } from '@/frontend/transport/http';
import type {
  CommentReportReason,
  CommentReportRow,
  CommentReportStatus,
} from '@/shared/contracts/comment-reports';

/** A member reports a comment; the snapshot is built on the server. */
export async function reportComment(
  commentId: string,
  reason: CommentReportReason
): Promise<{ id: string; createdAt: string }> {
  return request(`/api/community/comments/${encodeURIComponent(commentId)}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

/** The Admin Console's comment-report queue. */
export async function getAdminCommentReports(
  status?: CommentReportStatus
): Promise<CommentReportRow[]> {
  const search = status ? `?status=${encodeURIComponent(status)}` : '';
  const result = await request<{ success: boolean; reports: CommentReportRow[] }>(
    `/api/admin/comment-reports${search}`,
    { cache: 'no-store' }
  );
  return result.reports;
}

/** Records `reviewed` or `dismissed` and returns the row. */
export async function decideAdminCommentReport(
  id: string,
  status: 'reviewed' | 'dismissed'
): Promise<CommentReportRow> {
  const result = await request<{ success: boolean; report: CommentReportRow }>(
    `/api/admin/comment-reports/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ status }) }
  );
  return result.report;
}
