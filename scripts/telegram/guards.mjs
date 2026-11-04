/**
 * The guard rails, as code instead of as a sentence in a prompt.
 *
 * The prompt tells the agent not to push, not to merge and not to deploy to
 * production. A prompt is a request. These are the three commands that would
 * make a phone message irreversible, and each of them is refused by putting a
 * shim first in `PATH` for the agent's process only - the publish step and the
 * merge job never see these wrappers.
 *
 * The decision itself lives in `guard-decision.mjs`, so the rule has one copy
 * and can be tested without a shell.
 */

import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GUARDED_TOOLS } from './guard-decision.mjs';

export { GUARDED_TOOLS, decide } from './guard-decision.mjs';

function realBinary(tool, excludedDir) {
  const path = (process.env.PATH ?? '')
    .split(':')
    .filter((entry) => entry && entry !== excludedDir)
    .join(':');
  try {
    return execFileSync('which', [tool], {
      encoding: 'utf8',
      env: { ...process.env, PATH: path },
    }).trim();
  } catch {
    return '';
  }
}

/**
 * Writes the shims and returns the PATH to give the agent.
 *
 * A tool the runner does not have gets no shim: writing one that cannot forward
 * would turn "not installed" into "refused", which is a different and worse
 * answer.
 */
export function installGuards({ log = () => {} } = {}) {
  // `mkdtemp` rather than a predictable path: the directory is random and
  // owner-only, so nothing else on the runner can pre-create it or read the
  // shims. CodeQL's `js/insecure-temporary-file` is right about the old shape.
  const dir = mkdtempSync(join(tmpdir(), 'telegram-guards-'));
  const decisionModule = new URL('./guard-decision.mjs', import.meta.url).href;

  for (const tool of GUARDED_TOOLS) {
    const real = realBinary(tool, dir);
    if (!real) {
      log(`guard: ${tool} is not installed, no shim written`);
      continue;
    }

    const shim = join(dir, tool);
    writeFileSync(
      shim,
      [
        '#!/usr/bin/env node',
        `import { decide } from '${decisionModule}';`,
        "const { spawnSync } = await import('node:child_process');",
        `const real = ${JSON.stringify(real)};`,
        'const argv = process.argv.slice(2);',
        `const verdict = decide(${JSON.stringify(tool)}, argv);`,
        'if (!verdict.allow) {',
        '  process.stderr.write(`[guard] ${verdict.reason}\\n`);',
        '  process.exit(1);',
        '}',
        "const result = spawnSync(real, argv, { stdio: 'inherit' });",
        'process.exit(result.status ?? 1);',
      ].join('\n'),
      { mode: 0o755 }
    );
    chmodSync(shim, 0o755);
  }

  return `${dir}:${process.env.PATH ?? ''}`;
}

/**
 * The environment an agent turn is allowed to see.
 *
 * `AGENT_PUSH_TOKEN` is the one credential that can write a branch, so it never
 * reaches the child: the publish step keeps it, and the agent's world has no way
 * to push even if it ignored every instruction.
 */
export function agentEnvironment({ base = process.env, guardedPath } = {}) {
  const env = { ...base };
  delete env.AGENT_PUSH_TOKEN;
  delete env.RELEASE_TOKEN;
  if (guardedPath) env.PATH = guardedPath;
  return env;
}
