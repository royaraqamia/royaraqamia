#!/usr/bin/env node
/**
 * `npm run eval:agent` — ADR-0185 decision 3.
 *
 *   npm run eval:agent                    # offline: score the committed transcript
 *   npm run eval:agent -- --live          # re-record through the provider, then score
 *   npm run eval:agent -- --update-baseline
 *
 * Offline makes no network call and spends no token, so CI can run it on every
 * pull request. The transcript carries the prompt hash it was recorded against:
 * a prompt edit that was not re-recorded fails with that sentence instead of a
 * number moving for no visible reason.
 */

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const live = process.argv.includes('--live');
const passthrough = process.argv.slice(2).filter((value) => value === '--update-baseline');

const run = (command, args, env = process.env) => {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

if (live) {
  run('npx', ['vitest', 'run', '--config', 'scripts/nour-evals/vitest.eval.config.mts'], {
    ...process.env,
    NOUR_EVAL_RECORD: '1',
  });
}

run(process.execPath, [resolve(here, 'score-agent.mjs'), ...passthrough]);
