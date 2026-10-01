import type {
  TrainingApplication,
  TrainingApplicationStatus,
  TrainingCohort,
  TrainingCohortCreateInput,
  TrainingCohortUpdateInput,
  TrainingReleaseTargetStatus,
} from '@/shared/contracts/training';
import type { Paginated } from '@/shared/pagination';
import { request } from '@/frontend/transport/http';

export interface SubmitTrainingApplicationResult {
  success: boolean;
  referenceCode?: string;
  error?: string;
}

export interface TrainingApplicationActionResult {
  success: boolean;
  data?: TrainingApplication;
  error?: string;
}

export interface CohortActionResult {
  success: boolean;
  data?: TrainingCohort;
  error?: string;
}

/**
 * Field-level errors are produced client-side by the shared zod schema, so a
 * rejected submission only has to carry its message here. `request` throws an
 * `ApiError` with that message whenever the API responds `success: false`.
 */
export async function submitTrainingApplication(input: {
  course_slug: string;
  full_name: string;
  phone_whatsapp: string;
  goal?: string;
  cohort_id?: string | null;
}): Promise<SubmitTrainingApplicationResult> {
  try {
    return await request<SubmitTrainingApplicationResult>('/api/training/applications', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  } catch (error) {
    return error instanceof Error ? { success: false, error: error.message } : { success: false };
  }
}

export async function getTrainingApplications(
  page = 1,
  pageSize = 20,
  status?: TrainingApplicationStatus,
  search = ''
): Promise<Paginated<TrainingApplication>> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (status) params.set('status', status);
  if (search) params.set('search', search);

  try {
    return await request<Paginated<TrainingApplication>>(
      `/api/training/applications?${params.toString()}`
    );
  } catch {
    return { data: [], total: 0 };
  }
}

export async function updateTrainingApplication(
  id: string,
  input: { status: TrainingApplicationStatus; notes?: string | null }
): Promise<TrainingApplicationActionResult> {
  try {
    return await request<TrainingApplicationActionResult>(
      `/api/training/applications/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(input) }
    );
  } catch (error) {
    return error instanceof Error ? { success: false, error: error.message } : { success: false };
  }
}

/**
 * Enroll the application into a cohort, claiming a seat. A full cohort returns a
 * `409` which surfaces as `{ success: false, error }` — the caller must not treat
 * it as retryable-in-place.
 */
export async function enrollTrainingApplication(
  id: string,
  cohortId: string
): Promise<TrainingApplicationActionResult> {
  try {
    return await request<TrainingApplicationActionResult>(
      `/api/training/applications/${encodeURIComponent(id)}/enroll`,
      { method: 'POST', body: JSON.stringify({ cohort_id: cohortId }) }
    );
  } catch (error) {
    return error instanceof Error ? { success: false, error: error.message } : { success: false };
  }
}

/** Release the seat: move the application out of `enrolled`. */
export async function releaseTrainingApplication(
  id: string,
  input: { status: TrainingReleaseTargetStatus; notes?: string | null }
): Promise<TrainingApplicationActionResult> {
  try {
    return await request<TrainingApplicationActionResult>(
      `/api/training/applications/${encodeURIComponent(id)}/release`,
      { method: 'POST', body: JSON.stringify(input) }
    );
  } catch (error) {
    return error instanceof Error ? { success: false, error: error.message } : { success: false };
  }
}

// ------------------------------------------------------------
// Cohorts
// ------------------------------------------------------------

/** Public: open cohorts the apply form offers, with seat availability. */
export async function getOpenTrainingCohorts(): Promise<TrainingCohort[]> {
  try {
    const data = await request<{ cohorts: TrainingCohort[] }>('/api/training/cohorts');
    return data.cohorts ?? [];
  } catch {
    return [];
  }
}

export async function getTrainingCohorts(): Promise<TrainingCohort[]> {
  try {
    const data = await request<{ cohorts: TrainingCohort[] }>('/api/admin/training/cohorts');
    return data.cohorts ?? [];
  } catch {
    return [];
  }
}

export async function createTrainingCohort(
  input: TrainingCohortCreateInput
): Promise<CohortActionResult> {
  try {
    return await request<CohortActionResult>('/api/admin/training/cohorts', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  } catch (error) {
    return error instanceof Error ? { success: false, error: error.message } : { success: false };
  }
}

export async function updateTrainingCohort(
  id: string,
  input: TrainingCohortUpdateInput
): Promise<CohortActionResult> {
  try {
    return await request<CohortActionResult>(
      `/api/admin/training/cohorts/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(input) }
    );
  } catch (error) {
    return error instanceof Error ? { success: false, error: error.message } : { success: false };
  }
}
