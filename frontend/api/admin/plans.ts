import type {
  ActivatePlanInput,
  ActivationResult,
  AdminPlansQuery,
  AdminUserUsagePage,
  PlanSettings,
} from '@/shared/contracts/plans';
import { request } from '@/frontend/transport/http';

export interface AdminPlansResult extends AdminUserUsagePage {
  settings: PlanSettings;
}

export async function fetchPlanUsers(query: AdminPlansQuery): Promise<AdminPlansResult> {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.search) params.set('search', query.search);

  return request<AdminPlansResult>(`/api/admin/plans?${params.toString()}`);
}

export async function activatePlan(input: ActivatePlanInput): Promise<ActivationResult> {
  const data = await request<{ success: boolean; activation: ActivationResult }>(
    '/api/admin/plans/activate',
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.activation;
}
