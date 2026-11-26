#!/usr/bin/env node
/**
 * The offline half of `npm run eval:agent` (ADR-0185 decision 3).
 *
 * It scores the committed transcript — the provider's own tool calls and reply,
 * recorded once — against the case list in `suite.json`. No network call and no
 * token: a pull request recomputes the same four named scores from the same
 * bytes, so a prompt change that was not re-recorded fails on the hash rather
 * than on a mysterious drift.
 *
 * The live half is `node scripts/nour-evals/eval-agent.mjs --live`, which
 * re-records the transcript through the production turn and then calls this
 * scorer.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import { arg, deterministic, realSystemPrompt, summarize, usageTotals, writeJson } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(arg('repo', resolve(here, '../..')));

export const SCORE_NAMES = [
  'tool_choice',
  'argument_validity',
  'confirmation_discipline',
  'arabic_quality',
];

/** The prompt a transcript was recorded against, so a prompt edit cannot be silent. */
export function promptHash(repoRoot = root) {
  return createHash('sha256').update(realSystemPrompt(repoRoot)).digest('hex');
}

const typeOf = (value) => (Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value);

/**
 * Argument validity is about the model's own JSON, not the service's parse: a
 * tier-2 write is carded before its schema is checked, so the suite has to say
 * what a valid call looks like. `shape` is `{ key: 'number' | 'string' | ... }`;
 * an extra key is a refusal, matching every tool's strict schema.
 */
export function scoreArguments(calls, shape) {
  if (!shape) return { score: null, failures: [] };
  const failures = [];
  for (const [tool, expected] of Object.entries(shape)) {
    const own = calls.filter((call) => call.name === tool);
    if (!own.length) {
      failures.push(`${tool}: not called`);
      continue;
    }
    for (const call of own) {
      let parsed;
      try {
        parsed = JSON.parse(call.arguments ?? '{}');
      } catch {
        failures.push(`${tool}: arguments are not JSON`);
        continue;
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        failures.push(`${tool}: arguments are not an object`);
        continue;
      }
      for (const [key, type] of Object.entries(expected)) {
        if (!(key in parsed)) failures.push(`${tool}.${key}: missing`);
        else if (typeOf(parsed[key]) !== type)
          failures.push(`${tool}.${key}: expected ${type}, got ${typeOf(parsed[key])}`);
      }
      const extra = Object.keys(parsed).filter((key) => !(key in expected));
      if (extra.length) failures.push(`${tool}: unexpected ${extra.join(', ')}`);
    }
  }
  return { score: failures.length ? 0 : 1, failures };
}

/** One case's four named scores, recomputed from the recorded turn. */
export function scoreAgentCase(entry, expectation = {}) {
  const calls = (entry.rounds ?? []).flatMap((round) => round.toolCalls ?? []);
  const names = calls.map((call) => call.name);
  const required = expectation.tool?.require ?? [];
  const forbidden = expectation.tool?.forbid ?? [];
  const missing = required.filter((name) => !names.includes(name));
  const banned = forbidden.filter((name) => names.includes(name));
  const toolChoice = {
    score: missing.length || banned.length ? 0 : 1,
    failures: [
      ...missing.map((name) => `${name}: not called`),
      ...banned.map((name) => `${name}: forbidden but called`),
    ],
  };

  const argumentValidity = scoreArguments(calls, expectation.args);

  let confirmationDiscipline = { score: null, failures: [] };
  const proposed = new Set(entry.proposed ?? []);
  const executed = new Set(entry.executed ?? []);
  if (expectation.discipline === 'card') {
    const failures = [];
    for (const name of required) {
      if (!proposed.has(name)) failures.push(`${name}: not proposed as a card`);
      if (executed.has(name)) failures.push(`${name}: executed without confirmation`);
    }
    confirmationDiscipline = { score: failures.length ? 0 : 1, failures };
  } else if (expectation.discipline === 'read') {
    const failures = required
      .filter((name) => !executed.has(name))
      .map((name) => `${name}: not executed`);
    confirmationDiscipline = { score: failures.length ? 0 : 1, failures };
  } else if (expectation.discipline === 'none') {
    confirmationDiscipline = {
      score: calls.length ? 0 : 1,
      failures: calls.length ? [`tools called: ${names.join(', ')}`] : [],
    };
  }

  const gate = deterministic(entry.reply ?? '', expectation);
  const arabicQuality = { score: gate.pass ? 1 : 0, failures: gate.failures };

  return {
    tool_choice: toolChoice,
    argument_validity: argumentValidity,
    confirmation_discipline: confirmationDiscipline,
    arabic_quality: arabicQuality,
    deterministic: gate,
  };
}

const mean = (values) => {
  const numbers = values.filter((value) => typeof value === 'number');
  return numbers.length
    ? Number((numbers.reduce((sum, value) => sum + value, 0) / numbers.length).toFixed(2))
    : null;
};

/** The scorecard both the artifact and the baseline gate read. */
export function buildAgentReport(transcript, suite) {
  const expectations = new Map(suite.agent.map((testCase) => [testCase.id, testCase.expect]));
  const cases = transcript.cases.map((entry) => {
    const scored = scoreAgentCase(entry, expectations.get(entry.id) ?? {});
    const usage = usageTotals(entry.rounds);
    return {
      id: entry.id,
      slice: entry.slice,
      topic: entry.topic,
      userMessage: entry.userMessage,
      reply: entry.reply,
      error: entry.error ?? '',
      events: entry.events ?? [],
      usage,
      costUsd: usage ? Number(usage.listCostUsd.toFixed(6)) : null,
      deterministic: scored.deterministic,
      judge: entry.judge ?? { ok: false, scores: {}, reason: 'no recorded judge' },
      scores: Object.fromEntries(SCORE_NAMES.map((name) => [name, scored[name]])),
    };
  });

  const report = summarize({
    generatedAt: new Date().toISOString(),
    meta: {
      tiers: ['agent'],
      model: transcript.model,
      judge: transcript.judge ?? null,
      promptHash: transcript.promptHash,
      recordedAt: transcript.recordedAt,
    },
    tiers: [{ name: 'agent', cases }],
  });
  report.summary.scores = Object.fromEntries(
    SCORE_NAMES.map((name) => [
      name,
      mean(
        cases.map((entry) => entry.scores[name]?.score).filter((value) => typeof value === 'number')
      ),
    ])
  );
  report.summary.cases = cases.length;

  // Cost per turn is generation cost only: the judge is a fixed, separate model
  // for every run, so it cannot explain a difference between two candidates.
  const priced = cases.filter((entry) => entry.usage);
  if (priced.length) {
    const totalUsd = priced.reduce((sum, entry) => sum + entry.usage.listCostUsd, 0);
    report.summary.cost = {
      turns: priced.length,
      totalUsd: Number(totalUsd.toFixed(6)),
      perTurnUsd: Number((totalUsd / priced.length).toFixed(6)),
      inputTokens: priced.reduce((sum, entry) => sum + entry.usage.inputTokens, 0),
      outputTokens: priced.reduce((sum, entry) => sum + entry.usage.outputTokens, 0),
    };
  } else {
    report.summary.cost = null;
  }
  return report;
}

/** The transcript a prompt edit must be re-recorded against. */
export function transcriptProblem(transcript, repoRoot = root) {
  if (!transcript?.promptHash) return 'transcript has no promptHash';
  const current = promptHash(repoRoot);
  if (transcript.promptHash !== current) {
    return `the system prompt changed (recorded ${transcript.promptHash.slice(0, 12)}, current ${current.slice(0, 12)}); re-record with npm run eval:agent -- --live`;
  }
  return null;
}

/** Every named score that fell below the recorded baseline, case by case. */
export function baselineFailures(report, baseline, tolerance = 0) {
  const failures = [];
  for (const name of SCORE_NAMES) {
    const before = baseline?.summary?.scores?.[name];
    const now = report?.summary?.scores?.[name];
    if (typeof before !== 'number' || typeof now !== 'number') continue;
    if (now + tolerance < before) failures.push(`${name} regressed: ${before} -> ${now}`);
  }
  const beforeCases = new Map((baseline?.tiers?.[0]?.cases ?? []).map((c) => [c.id, c]));
  for (const entry of report?.tiers?.[0]?.cases ?? []) {
    const before = beforeCases.get(entry.id);
    if (!before) {
      failures.push(`${entry.id}: not in the baseline (re-run with --update-baseline)`);
      continue;
    }
    for (const name of SCORE_NAMES) {
      const was = before.scores?.[name]?.score;
      const is = entry.scores?.[name]?.score;
      if (typeof was !== 'number' || typeof is !== 'number') continue;
      if (is + tolerance < was) failures.push(`${entry.id} ${name} regressed: ${was} -> ${is}`);
    }
  }
  return failures;
}

function agentMarkdown(report) {
  const lines = [
    `# نور agent eval — ${report.generatedAt}`,
    '',
    `Model: ${report.meta.model}. Recorded: ${report.meta.recordedAt}. Prompt: \`${report.meta.promptHash?.slice(0, 12)}\`.`,
    '',
    'Four named scores, recomputed from the recorded provider turn with no network call:',
    '',
    '| Score | Mean |',
    '| --- | ---: |',
  ];
  for (const name of SCORE_NAMES) {
    lines.push(`| ${name} | ${report.summary.scores[name] ?? 'n/a'} |`);
  }
  const cost = report.summary.cost;
  if (cost) {
    lines.push(
      '',
      'Generation cost per turn (list price, judge excluded):',
      '',
      '| Metric | Value |',
      '| --- | ---: |',
      `| Mean per turn (USD) | ${cost.perTurnUsd} |`,
      `| Total (USD) | ${cost.totalUsd} |`,
      `| Input tokens | ${cost.inputTokens} |`,
      `| Output tokens | ${cost.outputTokens} |`
    );
  }
  lines.push(
    '',
    '| Case | Tool choice | Arguments | Confirmation | Arabic |',
    '| --- | ---: | ---: | ---: | ---: |'
  );
  for (const entry of report.tiers[0].cases) {
    const cell = (name) => entry.scores[name]?.score ?? 'n/a';
    lines.push(
      `| ${entry.id} | ${cell('tool_choice')} | ${cell('argument_validity')} | ${cell('confirmation_discipline')} | ${cell('arabic_quality')} |`
    );
  }
  const notable = report.tiers[0].cases.filter((entry) =>
    SCORE_NAMES.some((name) => entry.scores[name]?.score === 0)
  );
  lines.push('', '## Failures', '');
  if (!notable.length) lines.push('None.');
  for (const entry of notable) {
    lines.push(`### ${entry.id}`, '', `Member: ${JSON.stringify(entry.userMessage)}`, '');
    for (const name of SCORE_NAMES) {
      const failures = entry.scores[name]?.failures ?? [];
      if (failures.length) lines.push(`- **${name}**: ${failures.join('; ')}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const label = arg('label', '')
    .trim()
    .replace(/[^a-z0-9-]/gi, '');
  const suffix = label ? `-${label}` : '';
  const transcriptPath = resolve(here, `agent-transcript${suffix}.json`);
  const suite = JSON.parse(readFileSync(resolve(here, 'suite.json'), 'utf8'));
  const transcript = JSON.parse(readFileSync(transcriptPath, 'utf8'));
  const problem = transcriptProblem(transcript);
  if (problem) {
    console.error(`agent transcript is stale: ${problem}`);
    process.exit(1);
  }

  const report = buildAgentReport(transcript, suite);
  await writeJson(resolve(here, `eval-report-agent${suffix}.json`), report);
  const docPath = resolve(root, `docs/assistant/eval-report-agent${suffix}.md`);
  const markdown = await prettier.format(agentMarkdown(report), {
    ...(await prettier.resolveConfig(docPath)),
    parser: 'markdown',
  });
  writeFileSync(docPath, markdown);

  // A labelled run is evidence for a model comparison: it must never move the
  // shipped baseline, and a candidate scoring lower than the shipped model is
  // the measurement, not a CI regression to fail on.
  if (!label) {
    const baselinePath = resolve(here, 'agent-baseline.json');
    if (process.argv.includes('--update-baseline') || !existsSync(baselinePath)) {
      await writeJson(baselinePath, {
        generatedAt: report.generatedAt,
        model: report.meta.model,
        promptHash: report.meta.promptHash,
        summary: { scores: report.summary.scores },
        tiers: [
          {
            name: 'agent',
            cases: report.tiers[0].cases.map((entry) => ({
              id: entry.id,
              scores: entry.scores,
            })),
          },
        ],
      });
      console.log(`baseline written: ${baselinePath}`);
    } else {
      const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
      const failures = baselineFailures(report, baseline);
      if (failures.length) {
        console.error('agent eval regressed:');
        for (const failure of failures) console.error(`  - ${failure}`);
        process.exit(1);
      }
    }
  }

  console.log(`agent eval${label ? ` (${label})` : ''}: ${report.summary.cases} cases`);
  for (const name of SCORE_NAMES) {
    console.log(`  ${name.padEnd(24)} ${report.summary.scores[name] ?? 'n/a'}`);
  }
  if (report.summary.cost) {
    console.log(
      `  ${'cost_per_turn_usd'.padEnd(24)} ${report.summary.cost.perTurnUsd} (total ${report.summary.cost.totalUsd})`
    );
  }
  console.log(`report: ${resolve(root, `docs/assistant/eval-report-agent${suffix}.md`)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(String(error?.stack ?? error));
    process.exit(1);
  });
}
