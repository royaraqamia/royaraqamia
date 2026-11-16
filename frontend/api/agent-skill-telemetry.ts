import { request } from '@/frontend/transport/http';
import type { AgentSkillOutcomeRow } from '@/shared/contracts/agent-skill-telemetry';

/** The Admin Console's specialist tallies, most loaded first (#1449). */
export async function getAgentSkillOutcomes(): Promise<AgentSkillOutcomeRow[]> {
  const result = await request<{ success: boolean; skills: AgentSkillOutcomeRow[] }>(
    '/api/admin/agent/skills',
    { cache: 'no-store' }
  );
  return result.skills;
}
