#!/usr/bin/env node
/**
 * `npm run eval:agent` — ADR-0185 decision 3.
 *
 *   npm run eval:agent                    # offline: score the committed transcript
 *   npm run eval:agent -- --live          # re-record through the provider, then score
 *   npm run eval:agent -- --update-baseline
 *
 *   # One labelled run per model, then compare (ADR-0185 decision 2):
 *   node scripts/nour-evals/eval-agent.mjs --live --model <id> --label <name>
 *   node scripts/nour-evals/compare-models.mjs --current <a> --candidate <b>
 *
 * Offline makes no network call and spends no token, so CI can run it on every
 * pull request. The transcript carries the prompt hash it was recorded against:
 * a prompt edit that was not re-recorded fails with that sentence instead of a
 * number moving for no visible reason. A label writes beside the shipped
 * artifacts and never touches the baseline.
 */

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const valueOf = (name) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? (process.argv[at + 1] ?? '') : '';
};
const live = process.argv.includes('--live');
const label = valueOf('label')
  .trim()
  .replace(/[^a-z0-9-]/gi, '');
const model = valueOf('model').trim();
const updateBaseline = process.argv.includes('--update-baseline') && !label;

const run = (command, args, env = process.env) => {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  return result.status ?? 1;
};

let recordingStatus = 0;
if (live) {
  const env = { ...process.env, NOUR_EVAL_RECORD: '1' };
  if (label) env.NOUR_EVAL_ARTIFACT_LABEL = label;
  if (model) env.AI_CHAT_MODEL = model;
  // A candidate that fails a case still has evidence worth scoring; the scorer
  // runs either way and the report names the failing fixture.
  recordingStatus = run(
    'npx',
    ['vitest', 'run', '--config', 'scripts/nour-evals/vitest.eval.config.mts'],
    env
  );
}

const scoreArgs = [resolve(here, 'score-agent.mjs')];
if (label) scoreArgs.push('--label', label);
if (updateBaseline) scoreArgs.push('--update-baseline');
const scoreStatus = run(process.execPath, scoreArgs);
process.exit(recordingStatus || scoreStatus);
