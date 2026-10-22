import type { MyPlan, UsageState } from '@/shared/contracts/plans';
import { request } from '@/frontend/transport/http';

export async function getMyUsage(): Promise<UsageState> {
  const data = await request<{ success: boolean; state: UsageState }>('/api/me/usage');
  return data.state;
}

export async function getMyPlan(): Promise<MyPlan> {
  const data = await request<{ success: boolean } & MyPlan>('/api/me/plan');
  return { state: data.state, activations: data.activations };
}
