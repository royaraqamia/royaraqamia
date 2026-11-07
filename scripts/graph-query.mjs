#!/usr/bin/env node
/**
 * Ask the code graph a question, after making sure the graph can answer it.
 *
 * `graphify query` reads `graphify-out/graph.json` and nothing rebuilds that
 * file. A rebuild of this tree costs about a minute (measured: 69 s with
 * clustering, 48 s without), which makes a commit hook the wrong trade — it
 * would cost more than the commit it followed. So freshness is a property of
 * the question instead: this wrapper checks before it answers.
 *
 *   no graph at all                          -> build it once (`graphify extract`)
 *   graph built from another commit          -> `graphify update`
 *   a tracked file changed since the graph   -> `graphify update`
 *
 * Then it runs `graphify query` and passes every extra flag through, so
 * `--budget`, `--depth` and `--dfs` still reach the CLI.
 *
 * Usage:
 *   npm run graph -- "how does the session middleware reach Supabase auth"
 *   npm run graph -- "auth" --budget 1500
 *
 * `graphify path` and `graphify explain` are one word away and need no wrapper:
 * they are read-only and cheap.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'graphify-out');
const GRAPH = join(OUT, 'graph.json');
const REPORT = join(OUT, 'GRAPH_REPORT.md');
/** The commit this wrapper last built or refreshed the graph at. */
const MARKER = join(OUT, '.graph-query-head');

const USAGE = 'usage: npm run graph -- "<question>" [extra `graphify query` flags]';

/** A question is required; flags are passed through untouched. */
function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.error(USAGE);
    process.exit(0);
  }
  const flags = argv.filter((arg) => arg.startsWith('-'));
  const words = argv.filter((arg) => !arg.startsWith('-'));
  if (words.length === 0) {
    console.error(USAGE);
    process.exit(2);
  }
  return { question: words.join(' '), flags };
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' });
  if (result.error?.code === 'ENOENT') {
    console.error(
      'graph-query: `graphify` is not installed. Install it with:\n' +
        '  uv tool install "graphifyy[sql]"'
    );
    process.exit(2);
  }
  return result.status ?? 1;
}

/** Raw stdout on success — porcelain status depends on its leading columns. */
function capture(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8' });
  return result.status === 0 ? result.stdout : '';
}

const headCommit = () => capture('git', ['rev-parse', 'HEAD']).trim();

/**
 * The commit the graph describes, when something recorded it.
 *
 * `extract` writes no report, so a fresh build records itself in the marker;
 * a graph that `update` or `cluster-only` produced also names the commit in
 * `GRAPH_REPORT.md`, which is the fallback for one built before this wrapper
 * existed.
 */
function recordedCommit() {
  if (existsSync(MARKER)) {
    const marked = readFileSync(MARKER, 'utf8').trim();
    if (marked) return marked;
  }
  if (existsSync(REPORT)) {
    const match = readFileSync(REPORT, 'utf8').match(/Built from commit: `([0-9a-f]{7,40})`/);
    if (match) return match[1];
  }
  return null;
}

/**
 * Why the graph cannot be trusted right now, or null when it can.
 *
 * A new commit is the cheap case; an uncommitted edit is the common one while
 * an agent works, and `HEAD` does not move for it. `git status` gives the file
 * list and one `stat` per changed path is the price of the comparison.
 */
function staleness() {
  if (!existsSync(GRAPH)) return { reason: 'missing', detail: 'no graph in this checkout yet' };

  const head = headCommit();
  const recorded = recordedCommit();
  if (!recorded) {
    return { reason: 'unrecorded', detail: 'the graph does not say which commit it describes' };
  }
  if (head && !head.startsWith(recorded)) {
    return {
      reason: 'commit',
      detail: `graph is from ${recorded.slice(0, 8)}, HEAD is ${head.slice(0, 8)}`,
    };
  }

  const graphTime = statSync(GRAPH).mtimeMs;
  const changed = capture('git', ['status', '--porcelain', '--', '.', ':!graphify-out'])
    .split('\n')
    .filter(Boolean);

  for (const line of changed) {
    const entry = line.slice(3).trim();
    if (!entry) continue;
    // A rename reads as `old -> new`; a deleted path cannot be stat'ed. Both
    // mean the graph may still describe something that is no longer there.
    if (entry.includes(' -> ')) return { reason: 'edited', detail: 'files were renamed' };
    try {
      if (statSync(join(ROOT, entry)).mtimeMs > graphTime) {
        return { reason: 'edited', detail: `${entry} is newer than the graph` };
      }
    } catch {
      return { reason: 'edited', detail: `${entry} was removed` };
    }
  }
  return null;
}

const { question, flags } = parseArgs(process.argv.slice(2));
const stale = staleness();

if (stale) {
  const building = stale.reason === 'missing';
  console.error(
    `graph-query: ${stale.detail} — ${building ? 'building the graph' : 'refreshing it'}, ` +
      'about a minute.'
  );

  const before = existsSync(GRAPH) ? statSync(GRAPH).mtimeMs : 0;
  const status = building
    ? run('graphify', ['extract', '.', '--code-only'])
    : run('graphify', ['update', '.']);

  if (!existsSync(GRAPH)) {
    console.error('graph-query: the graph was not written; see the output above.');
    process.exit(1);
  }

  // `graphify` exits non-zero when it reports files it could not model, and that
  // is not a failed build: the graph is written either way. A rewritten graph is
  // the evidence that the run got far enough, so only then is HEAD recorded —
  // otherwise the next question would answer from a graph this one marked fresh.
  if (status === 0 || statSync(GRAPH).mtimeMs > before) {
    writeFileSync(MARKER, `${headCommit()}\n`, 'utf8');
  } else {
    console.error('graph-query: the refresh reported problems; answering from the last graph.');
  }
}

process.exit(run('graphify', ['query', question, ...flags]));
