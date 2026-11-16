import { listAgentSkillOutcomes } from '@/backend/controllers/agent-skill-telemetry-admin';
import { toNextResponse } from '@/backend/transport/http-result';

/** The Admin Console's specialist tallies (#1449). Read-only. */
export async function GET() {
  return toNextResponse(await listAgentSkillOutcomes());
}
