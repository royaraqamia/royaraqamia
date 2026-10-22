import type {
  LocalUsageActionKey,
  LocalUsageReportResult,
  MyPlan,
  PlanCaps,
  UsageState,
} from '@/shared/contracts/plans';
import { request } from '@/frontend/transport/http';

export async function getMyUsage(): Promise<UsageState> {
  const data = await request<{ success: boolean; state: UsageState }>('/api/me/usage');
  return data.state;
}

export async function getMyCaps(): Promise<PlanCaps> {
  const data = await request<{ success: boolean } & PlanCaps>('/api/me/caps');
  return { plan: data.plan, unlimited: data.unlimited, caps: data.caps };
}

export async function getMyPlan(): Promise<MyPlan> {
  const data = await request<{ success: boolean } & MyPlan>('/api/me/plan');
  return { state: data.state, activations: data.activations };
}

export interface LocalUsageReportEntry {
  clientEventId: string;
  actionKey: LocalUsageActionKey;
}

/**
 * Report the counters kept on the device. The server records each client event
 * at most once, so replaying a report after a lost response costs nothing.
 */
export async function reportLocalUsage(
  events: LocalUsageReportEntry[]
): Promise<LocalUsageReportResult> {
  const data = await request<{ success: boolean } & LocalUsageReportResult>('/api/me/usage/local', {
    method: 'POST',
    body: JSON.stringify({ events }),
    headers: { 'content-type': 'application/json' },
  });
  return {
    recorded: data.recorded,
    alreadyRecorded: data.alreadyRecorded,
    refused: data.refused,
    state: data.state,
  };
}
