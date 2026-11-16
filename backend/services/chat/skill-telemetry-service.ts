import type { SkillTelemetryRepository } from '@/backend/repositories/chat/skill-telemetry-repository';
import type { AgentSkillOutcomeRow } from '@/shared/contracts/agent-skill-telemetry';

/**
 * How many specialists one open of the operator's read carries.
 *
 * The roster is 283 ids; one page needs the ones that were actually offered,
 * most loaded first, and a long tail of ids with zero turns is not information.
 * The cap is the service's, not the page's, so no client can ask for the whole
 * table.
 */
const SKILL_OUTCOMES_LIMIT = 200;

export interface SkillTelemetryService {
  /** Every skill that was offered at least once, most loaded first. */
  list(): Promise<AgentSkillOutcomeRow[]>;
}

/**
 * The operator's read of what the specialists did (#1449).
 *
 * The aggregate itself is the view, so "which skills earned their place" is one
 * definition in the database rather than a query each surface rewrites. What
 * this service adds is the bound: a page asks for the list, and cannot widen it.
 *
 * It is an operator read only. Nothing in this contract reaches a member, and
 * the member-facing turn never asks it anything.
 */
export function createSkillTelemetryService({
  telemetry,
}: {
  telemetry: SkillTelemetryRepository;
}): SkillTelemetryService {
  return {
    list: () => telemetry.outcomes(SKILL_OUTCOMES_LIMIT),
  };
}
