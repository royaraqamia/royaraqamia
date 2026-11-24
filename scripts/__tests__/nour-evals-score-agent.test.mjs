import { describe, expect, it } from 'vitest';

import {
  baselineFailures,
  promptHash,
  scoreAgentCase,
  transcriptProblem,
} from '../nour-evals/score-agent.mjs';

const expectation = {
  language: 'ar',
  tool: { require: ['list_certificates'], forbid: [] },
  args: { list_certificates: {} },
  discipline: 'read',
};

const entry = (over = {}) => ({
  rounds: [{ text: '', toolCalls: [{ name: 'list_certificates', arguments: '{}' }] }],
  reply: 'عندك 3 شهادات.',
  executed: ['list_certificates'],
  proposed: [],
  ...over,
});

describe('agent eval named scores', () => {
  it('scores the recorded read and its arguments', () => {
    const scored = scoreAgentCase(entry(), expectation);
    expect(scored.tool_choice.score).toBe(1);
    expect(scored.argument_validity.score).toBe(1);
    expect(scored.confirmation_discipline.score).toBe(1);
    expect(scored.arabic_quality.score).toBe(1);
  });

  it('names a missing tool instead of failing mysteriously', () => {
    const scored = scoreAgentCase(entry({ rounds: [] }), expectation);
    expect(scored.tool_choice.score).toBe(0);
    expect(scored.tool_choice.failures).toContain('list_certificates: not called');
  });

  it('rejects a write that ran without a card', () => {
    const scored = scoreAgentCase(
      entry({
        rounds: [{ text: '', toolCalls: [{ name: 'record_expense', arguments: '{"amount":5}' }] }],
        executed: ['record_expense'],
        proposed: [],
      }),
      {
        language: 'ar',
        tool: { require: ['record_expense'], forbid: [] },
        args: { record_expense: { amount: 'number' } },
        discipline: 'card',
      }
    );
    expect(scored.confirmation_discipline.score).toBe(0);
    expect(scored.confirmation_discipline.failures).toContain(
      'record_expense: executed without confirmation'
    );
  });

  it('names the score that fell below the baseline', () => {
    const report = {
      summary: { scores: { tool_choice: 0.5 } },
      tiers: [{ cases: [{ id: 'agent-data-01', scores: { tool_choice: { score: 0 } } }] }],
    };
    const baseline = {
      summary: { scores: { tool_choice: 1 } },
      tiers: [{ cases: [{ id: 'agent-data-01', scores: { tool_choice: { score: 1 } } }] }],
    };
    const failures = baselineFailures(report, baseline);
    expect(failures).toContain('tool_choice regressed: 1 -> 0.5');
    expect(failures).toContain('agent-data-01 tool_choice regressed: 1 -> 0');
  });

  it('asks for a re-record when the prompt a transcript was cut against changed', () => {
    expect(transcriptProblem({ promptHash: promptHash() })).toBeNull();
    expect(transcriptProblem({ promptHash: 'stale' })).toContain(
      're-record with npm run eval:agent'
    );
  });
});
