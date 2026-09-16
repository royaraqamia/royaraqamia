import type { TrainingApplication, TrainingApplicationStatus } from '@/shared/contracts/training';
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

/**
 * Field-level errors are produced client-side by the shared zod schema, so a
 * rejected submission only has to carry its message here. `request` throws an
 * `ApiError` with that message whenever the API responds `success: false`.
 */
export async function submitTrainingApplication(input: {
  course_slug: string;
  full_name: string;
  phone_whatsapp: string;
  email?: string;
  experience_level: string;
  goal?: string;
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
): Promise<{ data: TrainingApplication[]; total: number }> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (status) params.set('status', status);
  if (search) params.set('search', search);

  try {
    return await request<{ data: TrainingApplication[]; total: number }>(
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
