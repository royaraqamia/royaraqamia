import { describe, expect, it } from 'vitest';

import gateFile from '@/evals/coding/reviewer-gate.json';
import {
  gatePasses,
  gateProblems,
  modelCostUsd,
  reviewerLimits,
} from '@/shared/contracts/coding-reviewer-gate.mjs';

/**
 * The reviewer gate is a measurement, not a setting (ADR-0223). These cases
 * pin the arithmetic: an edited status cannot outvote the stored evidence.
 */

const thresholds = {
  minRuns: 20,
  minCatchRate: 0.6,
  maxFalsePositiveRate: 0.2,
  maxMedianAddedLatencyMs: 45_000,
  maxCostUsdPerReview: 0.02,
};

const evidence = {
  recordedAt: '2026-11-26T00:00:00.000Z',
  suite: 'evals/coding/tasks.json',
  runs: 24,
  catchRate: 0.7,
  falsePositiveRate: 0.1,
  medianAddedLatencyMs: 20_000,
  costUsdPerReview: 0.005,
};

function gate(overrides = {}) {
  return {
    version: 1,
    status: 'on',
    model: 'claude-haiku-5-5',
    pricing: {
      'claude-haiku-5-5': { inputPerMTok: 1, outputPerMTok: 5 },
    },
    thresholds,
    diff: { minFiles: 2, minChangedLines: 40 },
    evidence,
    ...overrides,
  };
}

describe('the coding reviewer gate', () => {
  it('is off in the committed file and enables nothing', () => {
    expect(gateFile.status).toBe('off');
    expect(gateProblems(gateFile)).toEqual([]);
    expect(gatePasses(gateFile)).toBe(false);
    expect(reviewerLimits(gateFile)).toBeNull();
  });

  it('opens only when every threshold is met', () => {
    expect(gatePasses(gate())).toBe(true);
    expect(reviewerLimits(gate())).toEqual({
      model: 'claude-haiku-5-5',
      minFiles: 2,
      minChangedLines: 40,
    });

    expect(gatePasses(gate({ status: 'off' }))).toBe(false);
    expect(gatePasses(gate({ evidence: { ...evidence, runs: 19 } }))).toBe(false);
    expect(gatePasses(gate({ evidence: { ...evidence, catchRate: 0.59 } }))).toBe(false);
    expect(gatePasses(gate({ evidence: { ...evidence, falsePositiveRate: 0.21 } }))).toBe(false);
    expect(gatePasses(gate({ evidence: { ...evidence, medianAddedLatencyMs: 45_001 } }))).toBe(
      false
    );
    expect(gatePasses(gate({ evidence: { ...evidence, costUsdPerReview: 0.0201 } }))).toBe(false);
    expect(gatePasses(gate({ evidence: { ...evidence, suite: 'somewhere/else.json' } }))).toBe(
      false
    );
  });

  it('never enables a model the price table does not name', () => {
    expect(reviewerLimits(gate({ model: 'unknown-model' }))).toBeNull();
    expect(gateProblems(gate({ model: 'unknown-model' }))).toContain(
      'model "unknown-model" has no entry in pricing'
    );
  });

  it('estimates cost from measured tokens and the list price', () => {
    expect(modelCostUsd(gate(), 'claude-haiku-5-5', 1_000, 1_000)).toBeCloseTo(0.006, 8);
    expect(modelCostUsd(gate(), 'deepseek-v4.1-flash', 1_000_000, 1_000_000)).toBeNull();
  });
});
