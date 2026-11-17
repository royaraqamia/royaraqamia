#!/usr/bin/env node
/** Re-run deterministic gates over stored replies after a harness fix, no model calls. */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arg, deterministic } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(arg('repo', resolve(here, '../..')));
const suite = JSON.parse(readFileSync(resolve(here, 'suite.json'), 'utf8'));
const expectations = new Map();
for (const testCase of [...suite.model, ...suite.agent])
  expectations.set(testCase.id, testCase.expect);

const paths = [
  resolve(root, 'docs/assistant/eval-report-model.json'),
  resolve(here, 'eval-report-agent.json'),
];
for (const path of paths) {
  const report = JSON.parse(readFileSync(path, 'utf8'));
  for (const tier of report.tiers) {
    for (const c of tier.cases) {
      c.deterministic = deterministic(c.reply, expectations.get(c.id) ?? {});
    }
  }
  const { writeFileSync } = await import('node:fs');
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`recomputed ${path}\n`);
}
