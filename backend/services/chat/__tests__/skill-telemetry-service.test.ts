import { describe, expect, it, vi } from 'vitest';

import { createSkillTelemetryService } from '@/backend/services/chat/skill-telemetry-service';
import type { SkillTelemetryRepository } from '@/backend/repositories/chat/skill-telemetry-repository';
import type { AgentSkillOutcomeRow } from '@/shared/contracts/agent-skill-telemetry';

const ROW: AgentSkillOutcomeRow = {
  skillId: 'legal-document-review',
  loadedTurns: 4,
  declinedTurns: 1,
  answeredTurns: 3,
  retriedTurns: 1,
  failedTurns: 1,
};

function makeService(rows: AgentSkillOutcomeRow[] = []) {
  const outcomes = vi.fn(async () => rows);
  const telemetry: SkillTelemetryRepository = {
    record: vi.fn(async () => undefined),
    outcomes,
  };
  return { service: createSkillTelemetryService({ telemetry }), outcomes };
}

/**
 * The operator's read, behind its one bound (#1449).
 *
 * The cap is the service's, not the page's: 200 is every skill that was offered
 * at least once with room to spare, and it is written here as a literal because
 * widening it is a decision rather than a refactor.
 */
describe('the skill telemetry service', () => {
  it('bounds the read so no client can ask for the whole roster', async () => {
    const { service, outcomes } = makeService();

    await service.list();

    expect(outcomes).toHaveBeenCalledWith(200);
  });

  it('answers the rows the view computed, unchanged', async () => {
    const { service } = makeService([ROW]);

    await expect(service.list()).resolves.toEqual([ROW]);
  });
});
