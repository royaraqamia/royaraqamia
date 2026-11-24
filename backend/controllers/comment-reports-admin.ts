import { createDefaultCommentReportsAdminService } from '@/backend/config/comment-reports';
import { AppError, getErrorMessage } from '@/backend/shared/errors';
import { logger } from '@/backend/shared/logger';
import { NO_STORE } from '@/backend/transport/cache-policy';
import { withAdminUser } from '@/backend/transport/admin-handler';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import {
  CommentReportDecisionSchema,
  CommentReportListQuerySchema,
  type CommentReportRow,
} from '@/shared/contracts/comment-reports';

function fail(error: unknown, log: string): HttpResult {
  logger.error(log, { error: error instanceof Error ? error.message : String(error) });
  return jsonResult(
    error instanceof AppError ? error.statusCode : 500,
    { success: false, error: getErrorMessage(error) },
    { headers: NO_STORE }
  );
}

export async function listCommentReports(query: { status?: string | null }): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const parsed = CommentReportListQuerySchema.safeParse({ status: query.status ?? undefined });
      if (!parsed.success) {
        return jsonResult(
          400,
          { success: false, error: 'حالة الإبلاغ غير صالحة.' },
          { headers: NO_STORE }
        );
      }
      const reports = await createDefaultCommentReportsAdminService().list(
        parsed.data.status ?? null
      );
      return jsonResult(
        200,
        { success: true, reports } satisfies { success: true; reports: CommentReportRow[] },
        { headers: NO_STORE }
      );
    },
    { mapError: (error) => fail(error, 'Failed to list comment reports') }
  );
}

export async function decideCommentReport(id: string, body: unknown): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const parsed = CommentReportDecisionSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, { success: false, error: 'قرار غير معروف.' }, { headers: NO_STORE });
      }
      const report = await createDefaultCommentReportsAdminService().decide(id, parsed.data.status);
      if (!report) {
        return jsonResult(
          404,
          { success: false, error: 'الإبلاغ غير موجود.' },
          { headers: NO_STORE }
        );
      }
      return jsonResult(
        200,
        { success: true, report } satisfies { success: true; report: CommentReportRow },
        { headers: NO_STORE }
      );
    },
    { mapError: (error) => fail(error, 'Failed to decide a comment report') }
  );
}
