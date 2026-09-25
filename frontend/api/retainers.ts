import type { Retainer, RetainerInput, RetainerStatus } from '@/shared/contracts/retainers';
import { request } from '@/frontend/transport/http';

export interface SubmitRetainerResult {
  success: boolean;
  referenceCode?: string;
  error?: string;
}

/**
 * Field-level errors are produced client-side by the shared zod schema, so a
 * rejected submission only has to carry its message here. `request` throws an
 * `ApiError` with that message whenever the API responds `success: false`.
 */
export async function submitRetainer(input: RetainerInput): Promise<SubmitRetainerResult> {
  try {
    return await request<SubmitRetainerResult>('/api/retainers', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  } catch (error) {
    return error instanceof Error ? { success: false, error: error.message } : { success: false };
  }
}

export interface RetainerUpdateResult {
  success: boolean;
  data?: Retainer;
  error?: string;
}

export async function getRetainers(
  page = 1,
  pageSize = 20,
  status?: RetainerStatus,
  search = ''
): Promise<{ data: Retainer[]; total: number }> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (status) params.set('status', status);
  if (search) params.set('search', search);

  try {
    return await request<{ data: Retainer[]; total: number }>(
      `/api/retainers?${params.toString()}`
    );
  } catch {
    return { data: [], total: 0 };
  }
}

export async function updateRetainer(
  id: string,
  input: {
    status?: RetainerStatus;
    notes?: string | null;
    monthly_fee_usd?: number;
    paid_through?: string | null;
  }
): Promise<RetainerUpdateResult> {
  try {
    return await request<RetainerUpdateResult>(`/api/retainers/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  } catch (error) {
    return error instanceof Error ? { success: false, error: error.message } : { success: false };
  }
}
