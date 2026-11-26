/**
 * The reviewer gate (ADR-0223).
 *
 * A second model may look at a non-trivial diff only when a recorded eval run
 * says it earns the added latency and cost. This module is the one place that
 * decides, so the control plane, the committed evidence check and the runner
 * spec cannot disagree about whether review is on.
 *
 * `gatePasses` recomputes every threshold from the stored numbers rather than
 * trusting a boolean: a hand-edited `status: "on"` with weaker evidence must
 * still fail.
 */

export const CODING_REVIEWER_THRESHOLDS = Object.freeze({
  minRuns: 20,
  minCatchRate: 0.6,
  maxFalsePositiveRate: 0.2,
  maxMedianAddedLatencyMs: 45_000,
  maxCostUsdPerReview: 0.02,
});

/** The suite whose results are the only accepted evidence. */
export const CODING_REVIEWER_EVIDENCE_SUITE = 'evals/coding/tasks.json';

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * True only when the file says on *and* its evidence clears every threshold.
 * A missing, partial or stale record keeps the reviewer off.
 */
export function gatePasses(gate) {
  if (!gate || gate.status !== 'on') return false;
  const thresholds = gate.thresholds ?? CODING_REVIEWER_THRESHOLDS;
  const evidence = gate.evidence;
  if (!evidence || typeof evidence !== 'object') return false;
  if (evidence.suite !== CODING_REVIEWER_EVIDENCE_SUITE) return false;
  if (typeof evidence.recordedAt !== 'string' || !evidence.recordedAt) return false;
  if (!Number.isInteger(evidence.runs) || evidence.runs < thresholds.minRuns) return false;
  if (!finiteNumber(evidence.catchRate) || evidence.catchRate < thresholds.minCatchRate)
    return false;
  if (
    !finiteNumber(evidence.falsePositiveRate) ||
    evidence.falsePositiveRate > thresholds.maxFalsePositiveRate
  ) {
    return false;
  }
  if (
    !finiteNumber(evidence.medianAddedLatencyMs) ||
    evidence.medianAddedLatencyMs > thresholds.maxMedianAddedLatencyMs
  ) {
    return false;
  }
  if (
    !finiteNumber(evidence.costUsdPerReview) ||
    evidence.costUsdPerReview > thresholds.maxCostUsdPerReview
  ) {
    return false;
  }
  return true;
}

/** What the runner needs to decide that a diff is worth reviewing. */
export function reviewerLimits(gate) {
  if (!gatePasses(gate)) return null;
  const model = typeof gate.model === 'string' ? gate.model.trim() : '';
  if (!model || !gate.pricing || !gate.pricing[model]) return null;
  const diff = gate.diff ?? {};
  return {
    model,
    minFiles: Number.isInteger(diff.minFiles) ? diff.minFiles : 2,
    minChangedLines: Number.isInteger(diff.minChangedLines) ? diff.minChangedLines : 40,
  };
}

/**
 * Provider list-price estimate. Tokens are measured; the price table is the
 * deployment's own record of what it pays, so an unknown model costs null
 * rather than a guessed number.
 */
export function modelCostUsd(gate, model, inputTokens, outputTokens) {
  const price = gate?.pricing?.[model];
  if (!price || !finiteNumber(price.inputPerMTok) || !finiteNumber(price.outputPerMTok)) {
    return null;
  }
  return (
    (inputTokens / 1_000_000) * price.inputPerMTok +
    (outputTokens / 1_000_000) * price.outputPerMTok
  );
}

/** Every reason the gate is closed, for the check script's message. */
export function gateProblems(gate) {
  const problems = [];
  if (!gate || typeof gate !== 'object') return ['the gate file is not an object'];
  if (gate.status !== 'on' && gate.status !== 'off') problems.push('status must be "on" or "off"');
  if (gate.status === 'off') return problems;
  if (!gatePasses(gate))
    problems.push('status is "on" but the evidence does not clear the thresholds');
  if (!gate.model || !gate.pricing || !gate.pricing[gate.model]) {
    problems.push(`model "${String(gate.model)}" has no entry in pricing`);
  }
  return problems;
}
