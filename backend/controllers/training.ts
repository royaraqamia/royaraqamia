import * as Sentry from '@sentry/nextjs';
import type { z } from 'zod';
import { withAdminUser } from '@/backend/transport/admin-handler';
import { getOptionalUser } from '@/backend/middleware/auth-guard';
import { createDefaultTrainingApplicationService } from '@/backend/config/training';
import {
  TrainingApplicationClosedError,
  TrainingApplicationNotFoundError,
  TrainingApplicationRateLimitError,
} from '@/backend/services/training/training-application-service';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import {
  TRAINING_APPLICATION_STATUSES,
  TrainingApplicationSchema,
  TrainingApplicationUpdateSchema,
  type TrainingApplication,
  type TrainingApplicationStatus,
} from '@/shared/contracts/training';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

interface ApplicationActionResult {
  success: boolean;
  data?: TrainingApplication;
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

function isApplicationStatus(value: string): value is TrainingApplicationStatus {
  return (TRAINING_APPLICATION_STATUSES as readonly string[]).includes(value);
}

function normalizePage(page: number): number {
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function normalizePageSize(pageSize: number): number {
  if (!Number.isFinite(pageSize) || pageSize < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(pageSize), MAX_PAGE_SIZE);
}

/**
 * Public and unauthenticated by design: prospective students are the coldest
 * audience on the site and requiring an account would cost the lead. Protected
 * by a per-IP rate limit. A signed-in visitor is attributed opportunistically
 * when a session happens to exist.
 */
export async function submitTrainingApplication(body: unknown, ip: string): Promise<HttpResult> {
  const parsed = TrainingApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResult(400, {
      success: false,
      error: 'تحقق من الحقول المدخلة.',
      fieldErrors: zodFieldErrors(parsed.error),
    } satisfies ApplicationActionResult);
  }

  try {
    const { user } = await getOptionalUser();
    const application = await createDefaultTrainingApplicationService().submit(parsed.data, {
      ip,
      userId: user?.id ?? null,
    });

    return jsonResult(200, {
      success: true,
      referenceCode: application.reference_code,
    } satisfies ApplicationActionResult);
  } catch (error) {
    Sentry.captureException(error);

    if (error instanceof TrainingApplicationClosedError) {
      return jsonResult(400, {
        success: false,
        error: error.message,
      } satisfies ApplicationActionResult);
    }
    if (error instanceof TrainingApplicationRateLimitError) {
      return jsonResult(429, {
        success: false,
        error: error.message,
      } satisfies ApplicationActionResult);
    }

    return jsonResult(500, {
      success: false,
      error: 'حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.',
    } satisfies ApplicationActionResult);
  }
}

/**
 * The Training domain errors an Admin request may surface. Returning `null`
 * lets the Admin adapter fall back to its own `500` body.
 */
function mapTrainingApplicationError(error: unknown): HttpResult | null {
  if (error instanceof TrainingApplicationNotFoundError) {
    return jsonResult(404, {
      success: false,
      error: error.message,
    } satisfies ApplicationActionResult);
  }
  return null;
}

export async function listTrainingApplications(
  page: number,
  pageSize: number,
  status?: string | null,
  search?: string | null
): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const result = await createDefaultTrainingApplicationService().list({
        page: normalizePage(page),
        pageSize: normalizePageSize(pageSize),
        status: status && isApplicationStatus(status) ? status : undefined,
        search: search?.trim() || undefined,
      });
      return jsonResult(200, result);
    },
    { whenFailed: { success: false, error: 'تعذر تحميل الطلبات.' } }
  );
}

export async function updateTrainingApplication(id: string, body: unknown): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const parsed = TrainingApplicationUpdateSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, {
          success: false,
          error: 'تحقق من الحقول المدخلة.',
          fieldErrors: zodFieldErrors(parsed.error),
        } satisfies ApplicationActionResult);
      }

      const data = await createDefaultTrainingApplicationService().update(id, parsed.data);
      return jsonResult(200, { success: true, data } satisfies ApplicationActionResult);
    },
    {
      mapError: mapTrainingApplicationError,
      whenFailed: { success: false, error: 'تعذّر تحديث الطلب.' },
    }
  );
}
