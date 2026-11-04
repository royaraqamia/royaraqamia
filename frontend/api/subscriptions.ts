import type {
  SubscriptionRequest,
  SubscriptionRequestInput,
  SubscriptionRequestStatus,
  SubscriptionRequestUpdateInput,
} from '@/shared/contracts/subscriptions';
import type { Paginated } from '@/shared/pagination';
import { ApiError, request } from '@/frontend/transport/http';

export interface SubmitSubscriptionRequestResult {
  success: boolean;
  referenceCode?: string;
  error?: string;
  /** HTTP status when the server answered; absent on a network failure. */
  status?: number;
}

/**
 * The form's submit. Field errors are produced client-side by the shared zod
 * schema, so a rejected submission only has to carry its message here.
 */
export async function submitSubscriptionRequest(
  input: SubscriptionRequestInput
): Promise<SubmitSubscriptionRequestResult> {
  try {
    return await request<SubmitSubscriptionRequestResult>('/api/me/subscriptions', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  } catch (error) {
    return error instanceof Error
      ? {
          success: false,
          error: error.message,
          status: error instanceof ApiError ? error.status : undefined,
        }
      : { success: false };
  }
}

export interface SubscriptionRequestUpdateResult {
  success: boolean;
  data?: SubscriptionRequest;
  error?: string;
}

/** The Admin list, filtered and searched. A failure degrades to an empty page. */
export async function getSubscriptionRequests(
  page = 1,
  pageSize = 20,
  status?: SubscriptionRequestStatus,
  search = ''
): Promise<Paginated<SubscriptionRequest>> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (status) params.set('status', status);
  if (search) params.set('search', search);

  try {
    return await request<Paginated<SubscriptionRequest>>(`/api/subscriptions?${params.toString()}`);
  } catch {
    return { data: [], total: 0 };
  }
}

export async function updateSubscriptionRequest(
  id: string,
  input: SubscriptionRequestUpdateInput
): Promise<SubscriptionRequestUpdateResult> {
  try {
    return await request<SubscriptionRequestUpdateResult>(
      `/api/subscriptions/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(input) }
    );
  } catch (error) {
    return error instanceof Error ? { success: false, error: error.message } : { success: false };
  }
}

/**
 * The signed-in reader's own requests, used by the form to show a pending
 * request instead of asking a second time.
 */
export async function getMySubscriptionRequests(): Promise<SubscriptionRequest[]> {
  const result = await request<{ success: boolean; data?: SubscriptionRequest[] }>(
    '/api/me/subscriptions'
  );
  return result.data ?? [];
}
