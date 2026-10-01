import { withAdminUser } from '@/backend/transport/admin-handler';
import { createDefaultTrainingCohortsRepository } from '@/backend/config/training';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { zodFieldErrors } from '@/backend/shared/zod-field-errors';
import { isRepositoryError } from '@/backend/shared/repository-error';
import {
  TrainingCohortCreateSchema,
  TrainingCohortUpdateSchema,
  type TrainingCohort,
} from '@/shared/contracts/training';

interface CohortActionResult {
  success: boolean;
  data?: TrainingCohort;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Public: the apply form reads the cohorts a student may ask for. Only `open`
 * cohorts are exposed, and the response carries seat availability so the form
 * can show "أماكن متبقية" — advisory only, since a seat is claimed at enrollment.
 */
export async function listOpenTrainingCohorts(): Promise<HttpResult> {
  try {
    const cohorts = await createDefaultTrainingCohortsRepository().list({ status: 'open' });
    return jsonResult(200, { cohorts });
  } catch (error) {
    if (!isRepositoryError(error)) throw error;
    // The form degrades to "no cohorts" rather than failing the page.
    return jsonResult(200, { cohorts: [] });
  }
}

export async function listTrainingCohorts(): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const cohorts = await createDefaultTrainingCohortsRepository().list();
      return jsonResult(200, { cohorts });
    },
    { whenFailed: { success: false, error: 'تعذّر تحميل الدُّفعات.' } }
  );
}

export async function createTrainingCohort(body: unknown): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const parsed = TrainingCohortCreateSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, {
          success: false,
          error: 'تحقق من الحقول المدخلة.',
          fieldErrors: zodFieldErrors(parsed.error),
        } satisfies CohortActionResult);
      }

      const data = await createDefaultTrainingCohortsRepository().create(parsed.data);
      return jsonResult(200, { success: true, data } satisfies CohortActionResult);
    },
    { whenFailed: { success: false, error: 'تعذّر إنشاء الدُّفعة.' } }
  );
}

export async function updateTrainingCohort(id: string, body: unknown): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const parsed = TrainingCohortUpdateSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, {
          success: false,
          error: 'تحقق من الحقول المدخلة.',
          fieldErrors: zodFieldErrors(parsed.error),
        } satisfies CohortActionResult);
      }

      const data = await createDefaultTrainingCohortsRepository().update(id, parsed.data);
      return jsonResult(200, { success: true, data } satisfies CohortActionResult);
    },
    { whenFailed: { success: false, error: 'تعذّر تحديث الدُّفعة.' } }
  );
}
