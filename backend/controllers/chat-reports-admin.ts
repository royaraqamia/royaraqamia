import { createDefaultChatReportsAdminService } from '@/backend/config/chat-reports';
import { AppError, getErrorMessage } from '@/backend/shared/errors';
import { logger } from '@/backend/shared/logger';
import { NO_STORE } from '@/backend/transport/cache-policy';
import { withAdminUser } from '@/backend/transport/admin-handler';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import {
  ChatReportDecisionSchema,
  ChatReportListQuerySchema,
  type ChatReportRow,
} from '@/shared/contracts/chat-reports';

/**
 * The chat-report review queue in the Admin Console (ADR-0113).
 *
 * This reader is deliberately narrower than moderation: it lists what members
 * reported, draws the frozen snapshot, and records `reviewed` or `dismissed`.
 * Blocking, deleting and banning live on their own surfaces, so a report cannot
 * become a second way to do any of them.
 *
 * A read answers `no-store`: the body carries another member's messages, and the
 * authenticated seam's header does not survive a handler that returns its own
 * result.
 */
function adminErrorResponse(error: unknown, log: string): HttpResult {
  logger.error(log, { error: error instanceof Error ? error.message : String(error) });
  return jsonResult(
    error instanceof AppError ? error.statusCode : 500,
    { success: false, error: getErrorMessage(error) },
    { headers: NO_STORE }
  );
}

export async function listChatReports(query: { status?: string | null }): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const parsed = ChatReportListQuerySchema.safeParse({
        status: query.status ?? undefined,
      });
      if (!parsed.success) {
        return jsonResult(
          400,
          { success: false, error: 'حالة الإبلاغ غير صالحة.' },
          { headers: NO_STORE }
        );
      }

      const reports = await createDefaultChatReportsAdminService().list(parsed.data.status ?? null);
      return jsonResult(
        200,
        { success: true, reports } satisfies { success: true; reports: ChatReportRow[] },
        { headers: NO_STORE }
      );
    },
    { mapError: (error) => adminErrorResponse(error, 'Failed to list chat reports') }
  );
}

export async function decideChatReport(id: string, body: unknown): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const parsed = ChatReportDecisionSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, { success: false, error: 'قرار غير معروف.' }, { headers: NO_STORE });
      }

      const report = await createDefaultChatReportsAdminService().decide(id, parsed.data.status);
      return jsonResult(
        200,
        { success: true, report } satisfies { success: true; report: ChatReportRow },
        { headers: NO_STORE }
      );
    },
    { mapError: (error) => adminErrorResponse(error, 'Failed to decide a chat report') }
  );
}
