#!/usr/bin/env node
/**
 * CI-safe integrity check for the assistant eval evidence.
 *
 * It makes no network calls and spends no tokens: every number is recomputed
 * from replies and scores already committed. What it catches is a report that
 * no longer matches its suite or its labels — stale evidence, a hand-edited
 * score, a case removed from one side, a hard-gate flag that contradicts the
 * rule applied to the very reply it labels.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arg, deterministic } from './lib.mjs';
import {
  SCORE_NAMES,
  baselineFailures,
  scoreAgentCase,
  transcriptProblem,
} from './score-agent.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(arg('repo', resolve(here, '../..')));
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));

const suite = read(resolve(here, 'suite.json'));
const gold = read(resolve(here, 'gold-set.json'));
const reports = [
  read(resolve(root, 'docs/assistant/eval-report-model.json')),
  read(resolve(here, 'eval-report-agent.json')),
];

const expectations = new Map([...suite.model, ...suite.agent].map((c) => [c.id, c.expect]));
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

// 1. Every labelled case has an expectation, and its hard-gate flag matches the
// rule applied to the stored reply. Gold labels describe that reply, not a run.
for (const entry of gold.cases) {
  const expect = expectations.get(entry.id);
  check(Boolean(expect), `gold ${entry.id}: no matching case in suite.json`);
  if (!expect) continue;
  const verdict = deterministic(entry.reply, expect);
  check(
    verdict.pass === !entry.hardGate,
    `gold ${entry.id}: hardGate=${entry.hardGate} but the stored reply ${verdict.pass ? 'passes' : `fails (${verdict.failures.join('; ')})`}`
  );
  for (const axis of Object.keys(entry.gold)) {
    check(
      Array.isArray(expect.judge) && expect.judge.includes(axis),
      `gold ${entry.id}: axis ${axis} is not judged for this case`
    );
  }
}

// 2. Every reported case has an expectation, and its deterministic result is
// reproducible from the stored reply.
for (const report of reports) {
  for (const tier of report.tiers) {
    for (const entry of tier.cases) {
      const expect = expectations.get(entry.id);
      check(Boolean(expect), `${tier.name} ${entry.id}: no matching case in suite.json`);
      if (!expect) continue;
      const verdict = deterministic(entry.reply, expect);
      check(
        verdict.pass === entry.deterministic.pass &&
          verdict.failures.join('|') === entry.deterministic.failures.join('|'),
        `${tier.name} ${entry.id}: stored deterministic result does not match the reply`
      );
    }
  }
}

// 3. Published axis means are reproducible from the stored judge scores.
for (const report of reports) {
  if (!report.summary?.axes) continue;
  const totals = {};
  const counts = {};
  for (const tier of report.tiers) {
    for (const entry of tier.cases) {
      for (const [axis, score] of Object.entries(entry.judge.scores)) {
        if (typeof score !== 'number') continue;
        totals[axis] = (totals[axis] ?? 0) + score;
        counts[axis] = (counts[axis] ?? 0) + 1;
      }
    }
  }
  for (const [axis, value] of Object.entries(report.summary.axes)) {
    const expected = counts[axis] ? (totals[axis] / counts[axis]).toFixed(2) : null;
    check(
      expected === String(value),
      `report axis ${axis}: stored mean ${value}, recomputed ${expected}`
    );
  }
}

// 4. The agent transcript is the provider record the scorecard was computed
// from: same prompt hash, same named scores, and no named regression against
// the committed baseline. This is the token-free half of ADR-0185 decision 3.
const transcript = read(resolve(here, 'agent-transcript.json'));
const baseline = read(resolve(here, 'agent-baseline.json'));
const agentReport = reports[1];
const promptProblem = transcriptProblem(transcript, root);
check(!promptProblem, `transcript: ${promptProblem}`);

const transcriptIds = new Set(transcript.cases.map((entry) => entry.id));
for (const testCase of suite.agent) {
  check(transcriptIds.has(testCase.id), `suite ${testCase.id}: no transcript recording`);
}

const agentReportById = new Map(
  (agentReport.tiers?.[0]?.cases ?? []).map((entry) => [entry.id, entry])
);
for (const entry of transcript.cases) {
  const expectation = expectations.get(entry.id);
  check(Boolean(expectation), `transcript ${entry.id}: no matching case in suite.json`);
  if (!expectation) continue;
  const scored = scoreAgentCase(entry, expectation);
  const reported = agentReportById.get(entry.id);
  check(Boolean(reported), `transcript ${entry.id}: not in the agent report`);
  if (!reported) continue;
  for (const name of SCORE_NAMES) {
    const wanted = scored[name]?.score ?? null;
    const stored = reported.scores?.[name]?.score ?? null;
    check(
      wanted === stored,
      `report ${entry.id} ${name}: stored ${stored}, recomputed from the transcript ${wanted}`
    );
  }
}

for (const name of SCORE_NAMES) {
  const values = (agentReport.tiers?.[0]?.cases ?? [])
    .map((entry) => entry.scores?.[name]?.score)
    .filter((value) => typeof value === 'number');
  const expected = values.length
    ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
    : null;
  check(
    String(agentReport.summary?.scores?.[name]) === String(expected),
    `agent summary ${name}: stored ${agentReport.summary?.scores?.[name]}, recomputed ${expected}`
  );
}

for (const regression of baselineFailures(agentReport, baseline)) {
  check(false, `baseline: ${regression}`);
}

if (failures.length) {
  console.error('Assistant eval evidence is inconsistent:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  `Assistant eval evidence: ${gold.cases.length} gold labels and ${reports.reduce((n, r) => n + r.tiers.flatMap((t) => t.cases).length, 0)} reported cases are reproducible.`
);
