#!/usr/bin/env node
/**
 * Compare the LLM judge against the 30-reply gold set, per axis.
 *
 * The gold labels are agent-proposed from the written spec and are marked as
 * owner-review-required in gold-set.json. This check is a calibration
 * measurement, not a release gate until the owner confirms the labels.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import { arg } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(arg('repo', resolve(here, '../..')));
const gold = JSON.parse(readFileSync(resolve(here, 'gold-set.json'), 'utf8'));
const report = JSON.parse(
  readFileSync(resolve(root, 'docs/assistant/eval-report-model.json'), 'utf8')
);
const byId = new Map(report.tiers.flatMap((tier) => tier.cases).map((c) => [c.id, c]));

const missing = gold.cases.filter((entry) => !byId.has(entry.id)).map((entry) => entry.id);
if (missing.length) throw new Error(`gold cases missing from report: ${missing.join(', ')}`);

const advisory = new Set(gold.advisoryAxes ?? []);
const axes = {};
const lines = [
  '# Judge vs gold set',
  '',
  `${gold.cases.length} labelled replies · ${gold.labelledBy}`,
  '',
  `**${gold.status ?? 'calibration only'}**`,
  '',
  '> These are fixed replies from the pre-dialect-B baseline. They calibrate the',
  '> judge on known text; they are not the current product behaviour.',
  '',
  '| Axis | n | MAE | within 1 point | Gate |',
  '| --- | ---: | ---: | ---: | --- |',
];
let totalError = 0;
let totalCount = 0;
let totalClose = 0;
for (const entry of gold.cases) {
  for (const [axis, label] of Object.entries(entry.gold)) {
    const score = byId.get(entry.id).judge.scores[axis];
    if (typeof score !== 'number') continue;
    const error = Math.abs(score - label);
    const stat = (axes[axis] ??= { n: 0, error: 0, close: 0, advisory: advisory.has(axis) });
    stat.n += 1;
    stat.error += error;
    stat.close += error <= 1 ? 1 : 0;
    // Advisory axes are reported, but their error never enters the gate number.
    if (stat.advisory) continue;
    totalError += error;
    totalCount += 1;
    totalClose += error <= 1 ? 1 : 0;
  }
}
for (const [axis, stat] of Object.entries(axes)) {
  lines.push(
    `| ${axis} | ${stat.n} | ${(stat.error / stat.n).toFixed(2)} | ${Math.round((stat.close / stat.n) * 100)}% | ${stat.advisory ? 'advisory' : 'yes'} |`
  );
}
lines.push(
  '',
  `Calibrated axes only: MAE ${(totalError / totalCount).toFixed(2)}, within 1 point ${Math.round((totalClose / totalCount) * 100)}%.`,
  ''
);

const gateDisagreements = gold.cases.filter((entry) => {
  const actualFail = !byId.get(entry.id).deterministic.pass;
  return actualFail !== entry.hardGate;
});
lines.push('## Hard-gate disagreements', '');
if (!gateDisagreements.length) lines.push('None.');
for (const entry of gateDisagreements) {
  lines.push(
    `- ${entry.id}: gold=${entry.hardGate ? 'fail' : 'pass'}, harness=${byId.get(entry.id).deterministic.pass ? 'pass' : `fail (${byId.get(entry.id).deterministic.failures.join('; ')})`}`
  );
}
lines.push('', '## Label provenance', '', gold.note, gold.labelledBy, '');

const out = resolve(root, 'docs/assistant/gold-agreement.md');
writeFileSync(out, await prettier.format(`${lines.join('\n')}\n`, { parser: 'markdown' }));
process.stdout.write(`gold agreement: ${out}\n`);
process.stdout.write(
  `MAE ${(totalError / totalCount).toFixed(2)} · within-1 ${Math.round((totalClose / totalCount) * 100)}%\n`
);
