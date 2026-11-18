#!/usr/bin/env node
/**
 * Compare a blind independent re-label against the committed gold labels.
 *
 *   node scripts/nour-evals/compare-blind.mjs --labels <path-to-blind-labels.json>
 *
 * Only calibrated axes count toward the 80% agreement threshold; advisory
 * axes are still reported so their disagreements stay visible.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import { arg } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const gold = JSON.parse(readFileSync(resolve(here, 'gold-set.json'), 'utf8'));
const blind = JSON.parse(readFileSync(arg('labels'), 'utf8'));
const advisory = new Set(gold.advisoryAxes ?? []);
const byId = new Map(gold.cases.map((entry) => [entry.id, entry]));

const lines = [
  '# Blind re-label comparison',
  '',
  `${blind.cases.length} cases scored independently, without access to the committed labels.`,
  '',
  '| Case | Axis | Agent label | Blind label | Within 1 |',
  '| --- | --- | ---: | ---: | --- |',
];
let close = 0;
let total = 0;
let error = 0;
let gateAgree = 0;
for (const entry of blind.cases) {
  const mine = byId.get(entry.id);
  if (!mine) throw new Error(`blind case ${entry.id} is not in gold-set.json`);
  const scores = { ...entry.scores };
  // A stray hardGate inside `scores` is still a verdict; lift it out.
  const gate = typeof scores.hardGate === 'boolean' ? scores.hardGate : entry.hardGate;
  delete scores.hardGate;
  for (const [axis, blindScore] of Object.entries(scores)) {
    const label = mine.gold[axis];
    if (typeof label !== 'number' || typeof blindScore !== 'number') continue;
    const delta = Math.abs(label - blindScore);
    if (!advisory.has(axis)) {
      total += 1;
      error += delta;
      if (delta <= 1) close += 1;
    }
    lines.push(
      `| ${entry.id} | ${axis}${advisory.has(axis) ? ' (advisory)' : ''} | ${label} | ${blindScore} | ${delta <= 1 ? 'yes' : 'NO'} |`
    );
  }
  if (gate === mine.hardGate) gateAgree += 1;
  lines.push(
    `| ${entry.id} | hard gate | ${mine.hardGate ? 'fail' : 'pass'} | ${gate ? 'fail' : 'pass'} | ${gate === mine.hardGate ? 'yes' : 'NO'} |`
  );
}

const within = total ? Math.round((close / total) * 100) : 0;
const mae = total ? (error / total).toFixed(2) : 'n/a';
lines.push(
  '',
  `Calibrated axes: **${within}% within 1 point**, MAE ${mae} (${close}/${total}).`,
  `Hard-gate agreement: ${gateAgree}/${blind.cases.length}.`,
  '',
  within >= 80
    ? 'The labels survive the independent pass. They remain calibration-only until a human confirms them.'
    : 'Agreement is under 80%. Replace the agent-authored labels with the independent ones before this set gates anything.',
  '',
  'This is an independent LLM pass in a fresh context, not a human judgement.',
  ''
);

const out = resolve(root, 'docs/assistant/blind-relabel-result.md');
writeFileSync(out, await prettier.format(lines.join('\n'), { parser: 'markdown' }));
process.stdout.write(
  `blind comparison: ${out}\n${within}% within 1, MAE ${mae}, gates ${gateAgree}/${blind.cases.length}\n`
);
