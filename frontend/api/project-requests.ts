import type { ProjectRequestInput } from '@/shared/contracts/project-requests';
import { request } from '@/frontend/transport/http';

export interface SubmitProjectRequestResult {
  success: boolean;
  referenceCode?: string;
  error?: string;
}

/**
 * Field-level errors are produced client-side by the shared zod schema, so a
 * rejected submission only has to carry its message here. `request` throws an
 * `ApiError` with that message whenever the API responds `success: false`.
 */
export async function submitProjectRequest(
  input: ProjectRequestInput
): Promise<SubmitProjectRequestResult> {
  try {
    return await request<SubmitProjectRequestResult>('/api/project-requests', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  } catch (error) {
    return error instanceof Error ? { success: false, error: error.message } : { success: false };
  }
}
