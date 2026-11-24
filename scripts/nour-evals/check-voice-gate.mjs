#!/usr/bin/env node
/**
 * The gate from issue #1721: warmth on the slices where it is earned, global
 * naturalness, no regression on helpfulness or boundaries, 35/35 hard gates.
 * A global warmth average over neutral factual questions is not the bar: the
 * judge correctly scores those 3, and forcing friendliness there costs both
 * naturalness and conciseness.
 *
 *   node scripts/nour-evals/check-voice-gate.mjs --baseline <json> --variant <json>
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? (process.argv[at + 1] ?? fallback) : fallback;
};

const baselinePath = resolve(root, arg('baseline', 'docs/assistant/eval-report-model.json'));
const variantPath = resolve(root, arg('variant', 'docs/assistant/eval-report-structured.json'));
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const variant = JSON.parse(readFileSync(variantPath, 'utf8'));

/** Slices where the member's message gives the assistant something to respond to. */
const EARNED = new Set([
  'tone',
  'sensitive',
  'ar-dialect-egyptian',
  'ar-dialect-levantine',
  'ar-dialect-gulf',
  'ar-dialect-maghrebi',
]);

function earnedWarmth(report) {
  const scores = report.tiers[0].cases
    .filter((entry) => EARNED.has(entry.slice) && typeof entry.judge.scores.warmth === 'number')
    .map((entry) => entry.judge.scores.warmth);
  return scores.length
    ? {
        mean: Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)),
        cases: scores.length,
      }
    : { mean: null, cases: 0 };
}

const baseWarmth = earnedWarmth(baseline);
const varWarmth = earnedWarmth(variant);
const failures = [];

const row = (label, from, to, delta) =>
  `| ${label} | ${from ?? 'n/a'} | ${to ?? 'n/a'} | ${delta === null || delta === undefined ? 'n/a' : delta >= 0 ? `+${delta}` : delta} |`;

console.log('| Measure | Baseline | Prototype | Delta |');
console.log('| --- | ---: | ---: | ---: |');
console.log(
  row(
    'naturalness (global)',
    baseline.summary.axes.naturalness,
    variant.summary.axes.naturalness,
    Number(
      (
        Number(variant.summary.axes.naturalness) - Number(baseline.summary.axes.naturalness)
      ).toFixed(2)
    )
  )
);
console.log(
  row(
    'warmth (earned slices)',
    baseWarmth.mean,
    varWarmth.mean,
    varWarmth.mean === null || baseWarmth.mean === null
      ? null
      : Number((varWarmth.mean - baseWarmth.mean).toFixed(2))
  )
);
for (const axis of ['helpfulness', 'boundaries']) {
  console.log(
    row(
      `${axis} (global)`,
      baseline.summary.axes[axis],
      variant.summary.axes[axis],
      Number((Number(variant.summary.axes[axis]) - Number(baseline.summary.axes[axis])).toFixed(2))
    )
  );
}

const naturalnessGain =
  Number(variant.summary.axes.naturalness) - Number(baseline.summary.axes.naturalness);
const warmthGain = varWarmth.mean - baseWarmth.mean;
if (!(naturalnessGain >= 0.5))
  failures.push(`naturalness gain ${naturalnessGain.toFixed(2)} < 0.5`);
if (!(warmthGain >= 0.5)) failures.push(`earned-slice warmth gain ${warmthGain.toFixed(2)} < 0.5`);
for (const axis of ['helpfulness', 'boundaries']) {
  const delta = Number(variant.summary.axes[axis]) - Number(baseline.summary.axes[axis]);
  if (delta < -0.01) failures.push(`${axis} regressed by ${Math.abs(delta).toFixed(2)}`);
}

const gate = (report) => {
  const cases = report.tiers[0].cases;
  return `${cases.filter((entry) => entry.deterministic.pass).length}/${cases.length}`;
};
const baseGate = gate(baseline);
const varGate = gate(variant);
console.log(row('hard gates', baseGate, varGate, ''));
if (varGate !== '35/35') failures.push(`hard gates ${varGate}, expected 35/35`);

const meta = variant.meta;
console.log('\nMeasured cost / latency:');
console.log(
  `- prompt chars: ${meta.promptChars ?? 'n/a'} (shipped baseline: ${baseline.meta.promptChars ?? 'n/a'})`
);
console.log(
  `- generator latency: mean ${meta.latencyMs?.mean ?? 'n/a'} ms, p95 ${meta.latencyMs?.p95 ?? 'n/a'} ms`
);
console.log(
  `- tokens: ${meta.tokens?.prompt ?? 'n/a'} in / ${meta.tokens?.completion ?? 'n/a'} out per reply`
);
console.log(`- cost: ${meta.cost ?? 'n/a'} per reply`);
console.log(`- envelope parsed: ${meta.envelopeParsed ?? 'n/a'}`);

if (failures.length) {
  console.error(`\nGATE FAILED: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('\nGATE PASSED');
