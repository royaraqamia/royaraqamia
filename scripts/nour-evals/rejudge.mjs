#!/usr/bin/env node
/**
 * Re-run the judge over replies already collected, with no generator calls.
 * Used when the rubric changes (e.g. dialect policy A -> B): the replies stay
 * fixed so the score change is attributable to the judge, not to sampling.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  arg,
  config,
  deterministic,
  judge,
  loadEnvFile,
  pooled,
  summarize,
  writeReport,
} from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(arg('repo', resolve(here, '../..')));
loadEnvFile(arg('env'));
const cfg = config();
const suite = JSON.parse(readFileSync(resolve(here, 'suite.json'), 'utf8'));
const axesById = new Map([...suite.model, ...suite.agent].map((c) => [c.id, c.expect.judge]));
const expectations = new Map([...suite.model, ...suite.agent].map((c) => [c.id, c.expect]));
const path = resolve(root, 'docs/assistant/eval-report-model.json');
const report = JSON.parse(readFileSync(path, 'utf8'));
const cases = report.tiers[0].cases;
const runs = report.meta.runs ?? 1;

const work = cases.flatMap((entry) =>
  (entry.runs ?? [{ reply: entry.reply, judge: entry.judge }]).map((run, index) => ({
    id: entry.id,
    index,
    userMessage: entry.userMessage,
    reply: run.reply,
  }))
);

const updated = await pooled(work, 4, async (item) => ({
  ...item,
  judge: await judge(
    cfg,
    axesById.get(item.id) ?? ['naturalness', 'helpfulness'],
    item.userMessage,
    item.reply
  ),
}));

for (const entry of cases) {
  const own = updated.filter((item) => item.id === entry.id).sort((a, b) => a.index - b.index);
  const axisList = axesById.get(entry.id) ?? ['naturalness', 'helpfulness'];
  const scores = {};
  for (const axis of axisList) {
    const values = own.map((item) => item.judge.scores[axis]).filter((v) => typeof v === 'number');
    scores[axis] = values.length
      ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2))
      : null;
  }
  const ok = own.filter((item) => item.judge.ok).length;
  entry.judge = {
    ok: ok === own.length,
    scores,
    reason: `mean of ${own.length} runs (${ok}/${own.length} judge calls returned JSON)`,
  };
  // The soft length cap changed what counts as a gate failure, so recompute
  // each run's deterministic result and aggregate with the same "all runs"
  // rule the collector uses.
  const expect = expectations.get(entry.id) ?? {};
  if (entry.runs) {
    for (let i = 0; i < entry.runs.length; i += 1) {
      entry.runs[i].judge = own[i].judge;
      entry.runs[i].deterministic = deterministic(entry.runs[i].reply, expect);
    }
    entry.deterministic = {
      pass: entry.runs.every((run) => run.deterministic.pass),
      failures: [...new Set(entry.runs.flatMap((run) => run.deterministic.failures))],
      warnings: [...new Set(entry.runs.flatMap((run) => run.deterministic.warnings))],
      sentences: entry.runs[0].deterministic.sentences,
      actualLanguage: entry.runs[0].deterministic.actualLanguage,
    };
  } else {
    entry.deterministic = deterministic(entry.reply, expect);
  }
}

report.meta.judgeOk = `${updated.filter((item) => item.judge.ok).length}/${updated.length}`;
report.meta.runs = runs;
summarize(report);
await writeReport(root, report, '-model');
process.stdout.write(`rejudged ${updated.length} replies with ${cfg.judge}\n`);
