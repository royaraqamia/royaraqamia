import gateFile from '@/evals/coding/reviewer-gate.json';
import {
  gatePasses,
  modelCostUsd,
  reviewerLimits,
} from '@/shared/contracts/coding-reviewer-gate.mjs';

/**
 * The typed door to the committed reviewer gate (ADR-0223).
 *
 * The decision itself lives in the `.mjs` module so the evidence check and the
 * live control plane run exactly the same thresholds. This wrapper only gives
 * the server code a typed face and the JSON import.
 */

export interface CodingReviewerPricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

export interface CodingReviewerEvidence {
  recordedAt: string;
  suite: string;
  runs: number;
  catchRate: number;
  falsePositiveRate: number;
  medianAddedLatencyMs: number;
  costUsdPerReview: number;
  notes?: string;
}

export interface CodingReviewerGate {
  version: number;
  status: 'on' | 'off';
  model: string;
  pricing: Record<string, CodingReviewerPricing>;
  thresholds: {
    minRuns: number;
    minCatchRate: number;
    maxFalsePositiveRate: number;
    maxMedianAddedLatencyMs: number;
    maxCostUsdPerReview: number;
  };
  diff: { minFiles: number; minChangedLines: number };
  evidence: CodingReviewerEvidence | null;
}

export interface CodingReviewerLimits {
  model: string;
  minFiles: number;
  minChangedLines: number;
}

export const CODING_REVIEWER_GATE = gateFile as CodingReviewerGate;

/** Null when the gate is closed or its model has no price: review never runs. */
export function codingReviewerLimits(): CodingReviewerLimits | null {
  return reviewerLimits(CODING_REVIEWER_GATE) as CodingReviewerLimits | null;
}

export function codingReviewerEnabled(): boolean {
  return gatePasses(CODING_REVIEWER_GATE);
}

/** Null for a model the pricing table does not name. */
export function codingModelCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number | null {
  return modelCostUsd(CODING_REVIEWER_GATE, model, inputTokens, outputTokens);
}
