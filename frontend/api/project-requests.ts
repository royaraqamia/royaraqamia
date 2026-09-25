import type {
  ProjectRequest,
  ProjectRequestInput,
  ProjectRequestStatus,
} from '@/shared/contracts/project-requests';
import type { Paginated } from '@/shared/pagination';
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

export interface ProjectRequestUpdateResult {
  success: boolean;
  data?: ProjectRequest;
  error?: string;
}

export async function getProjectRequests(
  page = 1,
  pageSize = 20,
  status?: ProjectRequestStatus,
  search = ''
): Promise<Paginated<ProjectRequest>> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (status) params.set('status', status);
  if (search) params.set('search', search);

  try {
    return await request<Paginated<ProjectRequest>>(`/api/project-requests?${params.toString()}`);
  } catch {
    return { data: [], total: 0 };
  }
}

export async function updateProjectRequest(
  id: string,
  input: { status: ProjectRequestStatus; notes?: string | null }
): Promise<ProjectRequestUpdateResult> {
  try {
    return await request<ProjectRequestUpdateResult>(
      `/api/project-requests/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(input) }
    );
  } catch (error) {
    return error instanceof Error ? { success: false, error: error.message } : { success: false };
  }
}
