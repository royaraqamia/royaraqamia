#!/usr/bin/env node
/**
 * The permission request a headless run died waiting on, read from its own log
 * (ADR-0142).
 *
 * When a round is killed by the step's timeout and wrote no result file, the
 * outcome step used to conclude "the issue is too large for one round: slice
 * it". That is the wrong diagnosis when the last thing the CLI did was ask for
 * permission: the issue was fine, the run was blocked, and slicing it throws
 * away a specification that was never attempted.
 *
 * OpenCode writes its log to `~/.local/share/opencode/log/*.log` on the runner,
 * so the step that reports the outcome can read the same events the job log
 * shows. This prints the unanswered request as `<permission> <pattern>`, or
 * nothing when the last request was answered (or there was none).
 *
 * Usage:
 *   node scripts/agents/permission-ask.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** The newest log the CLI wrote, or null when the run wrote none. */
export function newestLog(
  dir = join(process.env.HOME || homedir(), '.local', 'share', 'opencode', 'log')
) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  const files = entries
    .filter((name) => name.endsWith('.log'))
    .map((name) => {
      const path = join(dir, name);
      try {
        return { path, mtime: statSync(path).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);
  return files[0]?.path ?? null;
}

/**
 * The last `asking { ... }` block, if nothing resolved it afterwards.
 *
 * `replied` is what the CLI logs when a client answers; `denied` is what a
 * `deny` rule raises. Either after the ask means the run was not blocked on it.
 */
export function unansweredAsk(text) {
  const asked = text.lastIndexOf('asking {');
  if (asked === -1) return null;
  const after = text.slice(asked);
  if (/\breplied\b|\bdenied\b/.test(after)) return null;

  const block = after.slice(0, after.indexOf('}') === -1 ? after.length : after.indexOf('}') + 1);
  const permission = block.match(/permission:\s*"([^"]+)"/)?.[1];
  const patterns = block.match(/patterns:\s*\[\s*([^\]]*)\]/)?.[1] ?? '';
  const first = patterns.match(/"([^"]+)"/)?.[1];
  if (!permission) return null;
  return { permission, pattern: first ?? '*' };
}

function main() {
  const path = newestLog();
  if (!path) return;
  const ask = unansweredAsk(readFileSync(path, 'utf8'));
  if (ask) process.stdout.write(`${ask.permission} ${ask.pattern}\n`);
}

if (process.argv[1] && /permission-ask\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main();
}
