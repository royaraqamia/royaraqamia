import { createDefaultNewsAdminService } from '@/backend/config/news';
import { AppError, getErrorMessage } from '@/backend/shared/errors';
import { logger } from '@/backend/shared/logger';
import { withAdminUser } from '@/backend/transport/admin-handler';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import {
  newsSourceApprovalSchema,
  newsSourceRejectionSchema,
  newsSourceRequestListSchema,
} from '@/shared/contracts/news';

/**
 * The news-source queue in the Admin Console.
 *
 * Approving is the only way a reader's proposal becomes fetchable, and it is the
 * one action that writes `news_sources` — the fetch reads that table, so this is
 * the review step ADR-0076 asks for, moved from a pull request to a click.
 */
function adminErrorResponse(error: unknown, log: string): HttpResult {
  logger.error(log, { error: error instanceof Error ? error.message : String(error) });
  return jsonResult(error instanceof AppError ? error.statusCode : 500, {
    success: false,
    error: getErrorMessage(error),
  });
}

export async function listNewsSourceRequests(query: { status?: string }): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const parsed = newsSourceRequestListSchema.safeParse(query);
      const requests = await createDefaultNewsAdminService().list(parsed.data?.status ?? null);
      return jsonResult(200, { success: true, requests });
    },
    { mapError: (error) => adminErrorResponse(error, 'Failed to list news source requests') }
  );
}

export async function approveNewsSourceRequest(id: string, body: unknown): Promise<HttpResult> {
  return withAdminUser(
    async (identity) => {
      const parsed = newsSourceApprovalSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, { success: false, error: 'تحقَّق من التصنيف والمنطقة.' });
      }

      const request = await createDefaultNewsAdminService().approve(
        id,
        parsed.data,
        identity.userId
      );
      return jsonResult(200, { success: true, request });
    },
    { mapError: (error) => adminErrorResponse(error, 'Failed to approve a news source') }
  );
}

export async function rejectNewsSourceRequest(id: string, body: unknown): Promise<HttpResult> {
  return withAdminUser(
    async (identity) => {
      const parsed = newsSourceRejectionSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, { success: false, error: 'الملاحظة طويلة جدًّا.' });
      }

      const request = await createDefaultNewsAdminService().reject(
        id,
        parsed.data,
        identity.userId
      );
      return jsonResult(200, { success: true, request });
    },
    { mapError: (error) => adminErrorResponse(error, 'Failed to reject a news source') }
  );
}
