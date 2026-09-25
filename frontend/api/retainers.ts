import type { RetainerInput } from '@/shared/contracts/retainers';
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
