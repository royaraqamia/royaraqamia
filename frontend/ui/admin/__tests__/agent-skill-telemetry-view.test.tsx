import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ getAgentSkillOutcomes: vi.fn() }));

vi.mock('@/frontend/api/agent-skill-telemetry', () => mocks);

import { AgentSkillTelemetryView } from '../agent-skills/agent-skill-telemetry-view';

const ROW = {
  skillId: 'legal-document-review',
  loadedTurns: 12,
  declinedTurns: 7,
  answeredTurns: 11,
  retriedTurns: 3,
  failedTurns: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAgentSkillOutcomes.mockResolvedValue([ROW]);
});

afterEach(cleanup);

/**
 * The operator's read (#1449): load counts and outcomes, per skill.
 *
 * The numbers are distinct on purpose. A tally that drew `loadedTurns` where
 * `declinedTurns` belongs would still pass a test that only looked for a digit,
 * and the whole point of the surface is which column a count lands in.
 */
describe('AgentSkillTelemetryView', () => {
  it('draws every specialist with its load count and how its turns ended', async () => {
    render(<AgentSkillTelemetryView />);

    expect(await screen.findByText(ROW.skillId)).toBeInTheDocument();
    for (const count of [
      ROW.loadedTurns,
      ROW.declinedTurns,
      ROW.answeredTurns,
      ROW.retriedTurns,
      ROW.failedTurns,
    ]) {
      expect(screen.getByText(String(count))).toBeInTheDocument();
    }
    expect(screen.getByRole('columnheader', { name: 'حُمّل' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'لم يُجب' })).toBeInTheDocument();
  });

  it('says nothing has been measured yet when no turn offered a specialist', async () => {
    mocks.getAgentSkillOutcomes.mockResolvedValue([]);
    render(<AgentSkillTelemetryView />);

    expect(await screen.findByText('لا أعداد بعد')).toBeInTheDocument();
  });

  it('offers a retry when the read fails, and does not claim an empty tally', async () => {
    mocks.getAgentSkillOutcomes.mockRejectedValueOnce(new Error('offline'));
    render(<AgentSkillTelemetryView />);

    expect(await screen.findByText('تعذر تحميل أعداد المتخصصين.')).toBeInTheDocument();
    expect(screen.queryByText('لا أعداد بعد')).not.toBeInTheDocument();

    mocks.getAgentSkillOutcomes.mockResolvedValueOnce([ROW]);
    screen.getByRole('button', { name: 'إعادة المحاولة' }).click();

    await waitFor(() => expect(screen.getByText(ROW.skillId)).toBeInTheDocument());
  });
});
