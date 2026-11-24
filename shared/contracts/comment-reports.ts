import { z } from 'zod';

/**
 * Reports on comments, read in the Admin Console (ADR-0217 decision 4).
 *
 * `snapshot` is built by `post_comment_report` from the stored rows at report
 * time, not from the client's payload: the reviewer sees the words that were
 * reported even after the comment is tombstoned.
 */
export const COMMENT_REPORT_REASONS = ['spam', 'abuse', 'other'] as const;
export type CommentReportReason = (typeof COMMENT_REPORT_REASONS)[number];

export const COMMENT_REPORT_STATUSES = ['open', 'reviewed', 'dismissed'] as const;
export type CommentReportStatus = (typeof COMMENT_REPORT_STATUSES)[number];

export const CommentReportReasonSchema = z.enum(COMMENT_REPORT_REASONS);
export const ReportCommentInputSchema = z.object({ reason: CommentReportReasonSchema });
export type ReportCommentInput = z.infer<typeof ReportCommentInputSchema>;

export const CommentReportSnapshotSchema = z.object({
  commentId: z.string(),
  body: z.string(),
  authorId: z.string(),
  createdAt: z.string(),
  postId: z.string(),
  postSlug: z.string().nullable(),
});
export type CommentReportSnapshot = z.infer<typeof CommentReportSnapshotSchema>;

/** One report as the admin queue draws it. */
export interface CommentReportRow {
  id: string;
  commentId: string;
  postId: string;
  reporterId: string;
  reason: CommentReportReason;
  status: CommentReportStatus;
  createdAt: string;
  snapshot: CommentReportSnapshot;
}

export const CommentReportListQuerySchema = z.object({
  status: z.enum(COMMENT_REPORT_STATUSES).optional(),
});

/** The only two decisions a reviewer makes; a report is never re-opened here. */
export const CommentReportDecisionSchema = z.object({
  status: z.enum(['reviewed', 'dismissed']),
});
