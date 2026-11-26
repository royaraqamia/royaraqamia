#!/usr/bin/env node
/**
 * Compare two labelled agent-tier reports — the evidence ADR-0185 decision 2
 * asks a model change to carry. Reads only committed artifacts, makes no
 * network call and spends no token.
 *
 *   node scripts/nour-evals/compare-models.mjs \
 *     --current current --candidate candidate
 *
 * A label resolves to `scripts/nour-evals/eval-report-agent-<label>.json`;
 * `--current`/`--candidate` also accept an explicit `.json` path.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import { arg } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

const reportPath = (value) =>
  value.endsWith('.json')
    ? resolve(process.cwd(), value)
    : resolve(here, `eval-report-agent-${value}.json`);

const current = JSON.parse(readFileSync(reportPath(arg('current', 'current')), 'utf8'));
const candidate = JSON.parse(readFileSync(reportPath(arg('candidate', 'candidate')), 'utf8'));

const SCORES = [
  ['tool_choice', 'Tool choice'],
  ['argument_validity', 'Arguments'],
  ['confirmation_discipline', 'Confirmation'],
  ['arabic_quality', 'Arabic'],
];

const meanOf = (values) => {
  const numbers = values.filter((value) => typeof value === 'number');
  return numbers.length
    ? Number((numbers.reduce((sum, value) => sum + value, 0) / numbers.length).toFixed(2))
    : null;
};
const show = (value) => (value == null ? 'n/a' : String(value));
const delta = (before, after) =>
  typeof before === 'number' && typeof after === 'number'
    ? Number((after - before).toFixed(2))
    : null;
const signed = (value) => (value == null ? 'n/a' : value > 0 ? `+${value}` : String(value));

const casesById = (report) =>
  new Map((report.tiers?.[0]?.cases ?? []).map((entry) => [entry.id, entry]));
const currentCases = casesById(current);
const candidateCases = casesById(candidate);
const ids = [...new Set([...currentCases.keys(), ...candidateCases.keys()])];

const namedMeans = (report, name) =>
  meanOf((report.tiers?.[0]?.cases ?? []).map((entry) => entry.scores?.[name]?.score));

const failing = (entry) => {
  const lines = [];
  for (const [name] of SCORES) {
    const score = entry?.scores?.[name];
    if (score && score.score === 0) {
      lines.push(`${name}: ${score.failures.join('; ') || 'scored 0'}`);
    }
  }
  return lines;
};
const judgeNotable = (entry) =>
  Object.entries(entry?.judge?.scores ?? {})
    .filter(([, score]) => typeof score === 'number' && score < 3.5)
    .map(([axis, score]) => `${axis} ${score}`);

const lines = [
  `# Chat model comparison — ${current.generatedAt ?? 'n/a'}`,
  '',
  `Current: \`${current.meta?.model}\` (${current.summary?.cases} cases). Candidate: \`${candidate.meta?.model}\` (${candidate.summary?.cases} cases). Judge: \`${current.meta?.judge}\`.`,
  `Transcripts: \`scripts/nour-evals/agent-transcript-current.json\`, \`scripts/nour-evals/agent-transcript-candidate.json\`.`,
  '',
  'Delta is candidate − current; a positive value is the candidate scoring higher.',
  '',
  '## Named scores',
  '',
  '| Score | Current | Candidate | Delta |',
  '| --- | ---: | ---: | ---: |',
];
for (const [name, label] of SCORES) {
  const before = namedMeans(current, name);
  const after = namedMeans(candidate, name);
  lines.push(`| ${label} | ${show(before)} | ${show(after)} | ${signed(delta(before, after))} |`);
}

lines.push(
  '',
  '## Judge axes',
  '',
  '| Axis | Current | Candidate | Delta |',
  '| --- | ---: | ---: | ---: |'
);
const axes = [
  ...new Set([
    ...Object.keys(current.summary?.axes ?? {}),
    ...Object.keys(candidate.summary?.axes ?? {}),
  ]),
].sort();
for (const axis of axes) {
  const before = Number(current.summary?.axes?.[axis]);
  const after = Number(candidate.summary?.axes?.[axis]);
  lines.push(
    `| ${axis} | ${show(Number.isFinite(before) ? before : null)} | ${show(Number.isFinite(after) ? after : null)} | ${signed(delta(Number.isFinite(before) ? before : null, Number.isFinite(after) ? after : null))} |`
  );
}

lines.push(
  '',
  '## Cost per turn (generation, judge excluded)',
  '',
  '| Metric | Current | Candidate |',
  '| --- | ---: | ---: |'
);
const costRow = (label, key) => {
  const before = current.summary?.cost?.[key];
  const after = candidate.summary?.cost?.[key];
  lines.push(`| ${label} | ${show(before)} | ${show(after)} |`);
};
costRow('Mean USD per turn', 'perTurnUsd');
costRow('Total USD', 'totalUsd');
costRow('Input tokens', 'inputTokens');
costRow('Output tokens', 'outputTokens');

lines.push('', '## Failing fixtures', '');
for (const [label, report, map] of [
  ['Current', current, currentCases],
  ['Candidate', candidate, candidateCases],
]) {
  const hits = [...map.values()].filter((entry) => failing(entry).length);
  lines.push(`### ${label} — ${hits.length ? `${hits.length} fixture(s)` : 'none'}`, '');
  if (!hits.length) lines.push('None.');
  for (const entry of hits) {
    lines.push(`- \`${entry.id}\`: ${failing(entry).join('; ')}`);
  }
  lines.push('');
}

const regressions = [];
const improvements = [];
for (const id of ids) {
  const before = currentCases.get(id);
  const after = candidateCases.get(id);
  for (const [name] of SCORES) {
    const was = before?.scores?.[name]?.score;
    const is = after?.scores?.[name]?.score;
    if (typeof was === 'number' && typeof is === 'number' && is < was) {
      regressions.push(`\`${id}\` ${name}: ${was} -> ${is}`);
    }
    if (typeof was === 'number' && typeof is === 'number' && is > was) {
      improvements.push(`\`${id}\` ${name}: ${was} -> ${is}`);
    }
  }
}
lines.push('## Named-score regressions', '');
lines.push(...(regressions.length ? regressions.map((line) => `- ${line}`) : ['None.']));
lines.push('', '## Named-score improvements', '');
lines.push(...(improvements.length ? improvements.map((line) => `- ${line}`) : ['None.']));

const notable = [...candidateCases.values()]
  .map((entry) => ({ entry, axes: judgeNotable(entry) }))
  .filter((row) => row.axes.length);
lines.push('', '## Candidate judge notes (axes below 3.5)', '');
lines.push(
  ...(notable.length
    ? notable.map((row) => `- \`${row.entry.id}\`: ${row.axes.join('; ')}`)
    : ['None.'])
);

const out = resolve(
  process.cwd(),
  arg('out', resolve(root, 'docs/assistant/eval-model-comparison.md'))
);
const text = await prettier.format(`${lines.join('\n')}\n`, {
  ...(await prettier.resolveConfig(out)),
  parser: 'markdown',
});
writeFileSync(out, text);
process.stdout.write(`comparison: ${out}\n`);
