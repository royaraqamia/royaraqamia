import * as Sentry from '@sentry/nextjs';
import type { z } from 'zod';
import { withAdminUser } from '@/backend/transport/admin-handler';
import { getOptionalUser } from '@/backend/middleware/auth-guard';
import { createDefaultProjectRequestService } from '@/backend/config/project-requests';
import {
  ProjectRequestNotFoundError,
  ProjectRequestRateLimitError,
} from '@/backend/services/project-requests/project-requests-service';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import {
  PROJECT_REQUEST_STATUSES,
  ProjectRequestSchema,
  ProjectRequestUpdateSchema,
  type ProjectRequest,
  type ProjectRequestStatus,
} from '@/shared/contracts/project-requests';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

interface ProjectRequestActionResult {
  success: boolean;
  data?: ProjectRequest;
  referenceCode?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function isProjectRequestStatus(value: string): value is ProjectRequestStatus {
  return (PROJECT_REQUEST_STATUSES as readonly string[]).includes(value);
}

function normalizePage(page: number): number {
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function normalizePageSize(pageSize: number): number {
  if (!Number.isFinite(pageSize) || pageSize < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(pageSize), MAX_PAGE_SIZE);
}

/**
 * Public and unauthenticated by design: a prospective Client is the coldest
 * audience on the site and requiring an account would cost the lead. Protected
 * by a per-IP rate limit. A signed-in visitor is attributed opportunistically
 * when a session happens to exist.
 */
export async function submitProjectRequest(body: unknown, ip: string): Promise<HttpResult> {
  const parsed = ProjectRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResult(400, {
      success: false,
      error: 'تحقق من الحقول المدخلة.',
      fieldErrors: zodFieldErrors(parsed.error),
    } satisfies ProjectRequestActionResult);
  }

  try {
    const { user } = await getOptionalUser();
    const request = await createDefaultProjectRequestService().submit(parsed.data, {
      ip,
      userId: user?.id ?? null,
    });

    return jsonResult(200, {
      success: true,
      referenceCode: request.reference_code,
    } satisfies ProjectRequestActionResult);
  } catch (error) {
    Sentry.captureException(error);

    if (error instanceof ProjectRequestRateLimitError) {
      return jsonResult(429, {
        success: false,
        error: error.message,
      } satisfies ProjectRequestActionResult);
    }

    return jsonResult(500, {
      success: false,
      error: 'حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.',
    } satisfies ProjectRequestActionResult);
  }
}

/**
 * The Project Request domain errors an Admin request may surface. Returning
 * `null` lets the Admin adapter fall back to its own `500` body.
 */
function mapProjectRequestError(error: unknown): HttpResult | null {
  if (error instanceof ProjectRequestNotFoundError) {
    return jsonResult(404, {
      success: false,
      error: error.message,
    } satisfies ProjectRequestActionResult);
  }
  return null;
}

export async function listProjectRequests(
  page: number,
  pageSize: number,
  status?: string | null,
  search?: string | null
): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const result = await createDefaultProjectRequestService().list({
        page: normalizePage(page),
        pageSize: normalizePageSize(pageSize),
        status: status && isProjectRequestStatus(status) ? status : undefined,
        search: search?.trim() || undefined,
      });
      return jsonResult(200, result);
    },
    { whenFailed: { success: false, error: 'تعذر تحميل الطلبات.' } }
  );
}

export async function updateProjectRequest(id: string, body: unknown): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const parsed = ProjectRequestUpdateSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, {
          success: false,
          error: 'تحقق من الحقول المدخلة.',
          fieldErrors: zodFieldErrors(parsed.error),
        } satisfies ProjectRequestActionResult);
      }

      const data = await createDefaultProjectRequestService().update(id, parsed.data);
      return jsonResult(200, { success: true, data } satisfies ProjectRequestActionResult);
    },
    {
      mapError: mapProjectRequestError,
      whenFailed: { success: false, error: 'تعذّر تحديث الطلب.' },
    }
  );
}
