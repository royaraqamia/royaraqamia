#!/usr/bin/env node
/** Merge the two tier reports into the single scorecard named in the spec. */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arg, summarize, writeReport } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(arg('repo', resolve(here, '../..')));
const model = JSON.parse(
  readFileSync(resolve(root, 'docs/assistant/eval-report-model.json'), 'utf8')
);
const agent = JSON.parse(readFileSync(resolve(here, 'eval-report-agent.json'), 'utf8'));

const report = summarize({
  generatedAt: new Date().toISOString(),
  meta: {
    tiers: ['model', 'agent'],
    model: model.meta.model,
    judge: model.meta.judge,
    baseline: false,
    promptChars: model.meta.promptChars,
  },
  tiers: [...model.tiers, ...agent.tiers],
});

await writeReport(root, report);
process.stdout.write(`combined report: ${resolve(root, 'docs/assistant/eval-report.md')}\n`);
for (const [axis, mean] of Object.entries(report.summary.axes)) {
  process.stdout.write(`${axis.padEnd(14)} ${mean}\n`);
}
