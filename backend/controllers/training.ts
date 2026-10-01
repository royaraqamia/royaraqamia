import * as Sentry from '@sentry/nextjs';
import { createStatusGuard, parseAdminListQuery } from '@/backend/controllers/admin-list';
import { withAdminUser } from '@/backend/transport/admin-handler';
import { getOptionalUser } from '@/backend/middleware/auth-guard';
import { createDefaultTrainingApplicationService } from '@/backend/config/training';
import {
  TrainingApplicationClosedError,
  TrainingApplicationNotFoundError,
  TrainingApplicationRateLimitError,
} from '@/backend/services/training/training-application-service';
import {
  AlreadyEnrolledError,
  CohortClosedError,
  CohortFullError,
  CohortNotFoundError,
  InvalidReleaseStatusError,
  NotEnrolledError,
} from '@/backend/repositories/training/training-applications-repository';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { zodFieldErrors } from '@/backend/shared/zod-field-errors';
import { isRepositoryError } from '@/backend/shared/repository-error';
import {
  TRAINING_APPLICATION_STATUSES,
  TrainingApplicationEnrollSchema,
  TrainingApplicationReleaseSchema,
  TrainingApplicationSchema,
  TrainingApplicationUpdateSchema,
  type TrainingApplication,
} from '@/shared/contracts/training';

interface ApplicationActionResult {
  success: boolean;
  data?: TrainingApplication;
  referenceCode?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

const isApplicationStatus = createStatusGuard(TRAINING_APPLICATION_STATUSES);

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
    if (!isRepositoryError(error)) Sentry.captureException(error);

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
  if (error instanceof CohortFullError) {
    return jsonResult(409, {
      success: false,
      error: 'اكتمل عدد المقاعد في هذه الدُّفعة.',
    } satisfies ApplicationActionResult);
  }
  if (error instanceof CohortNotFoundError) {
    return jsonResult(404, {
      success: false,
      error: 'الدُّفعة المختارة غير موجودة.',
    } satisfies ApplicationActionResult);
  }
  if (error instanceof CohortClosedError) {
    return jsonResult(400, {
      success: false,
      error: 'هذه الدُّفعة مُغلَقة.',
    } satisfies ApplicationActionResult);
  }
  if (error instanceof AlreadyEnrolledError) {
    return jsonResult(409, {
      success: false,
      error: 'الطَّلب مُسجَّل بالفعل في دُفعة.',
    } satisfies ApplicationActionResult);
  }
  if (error instanceof NotEnrolledError) {
    return jsonResult(409, {
      success: false,
      error: 'الطَّلب غير مُسجَّل في أي دُفعة.',
    } satisfies ApplicationActionResult);
  }
  if (error instanceof InvalidReleaseStatusError) {
    return jsonResult(400, {
      success: false,
      error: 'حالة غير معروفة.',
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
      const result = await createDefaultTrainingApplicationService().list(
        parseAdminListQuery(page, pageSize, status, search, isApplicationStatus)
      );
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

/**
 * Enrolls an application into a cohort, claiming a seat. An explicit action, not
 * a status flip: the seat is scarce and must not be consumed by a dropdown write.
 */
export async function enrollTrainingApplication(id: string, body: unknown): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const parsed = TrainingApplicationEnrollSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, {
          success: false,
          error: 'تحقق من الحقول المدخلة.',
          fieldErrors: zodFieldErrors(parsed.error),
        } satisfies ApplicationActionResult);
      }

      const data = await createDefaultTrainingApplicationService().enroll(
        id,
        parsed.data.cohort_id
      );
      return jsonResult(200, { success: true, data } satisfies ApplicationActionResult);
    },
    {
      mapError: mapTrainingApplicationError,
      whenFailed: { success: false, error: 'تعذّر تسجيل الطَّلب.' },
    }
  );
}

/** Releases a seat: moves the application out of `enrolled` and frees capacity. */
export async function releaseTrainingApplication(id: string, body: unknown): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const parsed = TrainingApplicationReleaseSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, {
          success: false,
          error: 'تحقق من الحقول المدخلة.',
          fieldErrors: zodFieldErrors(parsed.error),
        } satisfies ApplicationActionResult);
      }

      const data = await createDefaultTrainingApplicationService().release(
        id,
        parsed.data.status,
        parsed.data.notes ?? null
      );
      return jsonResult(200, { success: true, data } satisfies ApplicationActionResult);
    },
    {
      mapError: mapTrainingApplicationError,
      whenFailed: { success: false, error: 'تعذّر تحرير المقعد.' },
    }
  );
}
