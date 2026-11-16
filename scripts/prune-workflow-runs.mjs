#!/usr/bin/env node
/**
 * The run list is pruned by a clock, not by the retention setting (ADR-0204).
 *
 * The repository's "check, workflow run, status, artifact and log retention"
 * setting only expires logs, artifacts and check data; the run itself stays in
 * the Actions list forever. On 2026-11-16 that list held 11,936 runs back to
 * 2026-07-06 - four months past a 90-day ceiling - and they were removed by
 * hand, one API call at a time. This script is that hand, on a schedule.
 *
 * Two things bound it, and both are real:
 *   - A `GITHUB_TOKEN` gets 1,000 requests an hour per repository, and every
 *     delete is one request. So the run deletes a bounded number, oldest first,
 *     and stops when the budget is nearly spent; the remainder converges on the
 *     next run of the workflow instead of failing this one.
 *   - A run that is not finished cannot be deleted, so `status` must be
 *     `completed`. A queued run that happens to be old is left alone.
 *
 * Usage:
 *   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo node scripts/prune-workflow-runs.mjs
 *   node scripts/prune-workflow-runs.mjs --keep-days 2 --max 800 --dry-run
 *
 * The defaults are the workflow's: keep two days, delete at most 800 a run.
 */

import { appendFileSync } from 'node:fs';

const API = 'https://api.github.com';
const LIST_PAGE_SIZE = 100;
/** The budget leaves room for the listing pages, retries and the next job. */
const QUOTA_FLOOR = 40;
const NETWORK_ATTEMPTS = 3;
const DELETE_CONCURRENCY = 4;

export const DEFAULTS = { keepDays: 2, maxDeletes: 800 };

const USAGE = `Usage: prune-workflow-runs.mjs [--keep-days N] [--max N] [--dry-run]

  --keep-days N  keep completed runs younger than N days (default ${DEFAULTS.keepDays})
  --max N        delete at most N runs this time (default ${DEFAULTS.maxDeletes})
  --dry-run      list what would go, delete nothing
  --help         show this

Reads GITHUB_TOKEN and GITHUB_REPOSITORY from the environment.`;

function positiveInteger(flag, value) {
  if (value === undefined) throw new Error(`${flag} needs a value`);
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(`${flag} needs a positive integer`);
  return number;
}

/** The flags, then the environment, then the defaults. */
export function parseArgs(argv = [], env = {}) {
  const options = {
    keepDays: env.KEEP_DAYS ? positiveInteger('KEEP_DAYS', env.KEEP_DAYS) : DEFAULTS.keepDays,
    maxDeletes: env.MAX_DELETES
      ? positiveInteger('MAX_DELETES', env.MAX_DELETES)
      : DEFAULTS.maxDeletes,
    dryRun: env.DRY_RUN === 'true',
    repo: env.GITHUB_REPOSITORY || '',
    token: env.GITHUB_TOKEN || '',
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--keep-days') options.keepDays = positiveInteger(arg, argv[++i]);
    else if (arg === '--max') options.maxDeletes = positiveInteger(arg, argv[++i]);
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }

  return options;
}

/**
 * What goes: a completed run created before the cutoff, oldest first, no more
 * than the run is allowed to delete. A run that is not finished is never a
 * candidate, however old it looks.
 */
export function selectTargets(runs, { cutoff, maxDeletes }) {
  const eligible = runs
    .filter((run) => run.status === 'completed' && Date.parse(run.created_at) < cutoff)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  return { targets: eligible.slice(0, maxDeletes), backlog: eligible.length };
}

/** The hourly request budget, read off whatever the API answered last. */
function requestBudget(log) {
  let budget = Infinity;
  return {
    note(headers) {
      const remaining = Number(headers?.get?.('x-ratelimit-remaining'));
      if (Number.isFinite(remaining)) budget = remaining;
    },
    get budget() {
      return budget;
    },
    log,
  };
}

/**
 * Everything the script does, with the network and the clock injected so a test
 * can answer instead of GitHub.
 */
export async function prune({
  token,
  repo,
  keepDays = DEFAULTS.keepDays,
  maxDeletes = DEFAULTS.maxDeletes,
  dryRun = false,
  now = Date.now(),
  fetchImpl = fetch,
  log = () => {},
  summary = () => {},
}) {
  if (!token) throw new Error('no GITHUB_TOKEN');
  if (!/^[^/]+\/[^/]+$/.test(repo)) throw new Error('GITHUB_REPOSITORY must be owner/repo');

  const cutoff = now - keepDays * 24 * 60 * 60 * 1000;
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'royaraqamia-prune-workflow-runs',
  };
  const api = requestBudget(log);

  async function call(url, options = {}) {
    let lastError;
    for (let attempt = 0; attempt < NETWORK_ATTEMPTS; attempt++) {
      try {
        const response = await fetchImpl(url, { ...options, headers });
        api.note(response.headers);
        return response;
      } catch (error) {
        lastError = error;
        log(
          `network error on ${options.method || 'GET'} ${url.replace(API, '')}: ${error.message}`
        );
      }
    }
    throw lastError;
  }

  const runs = [];
  let total = 0;
  for (let page = 1; page <= 400; page++) {
    const response = await call(
      `${API}/repos/${repo}/actions/runs?per_page=${LIST_PAGE_SIZE}&page=${page}`
    );
    if (!response.ok) {
      throw new Error(`listing runs failed: ${response.status} ${await response.text()}`);
    }
    const body = await response.json();
    total = body.total_count ?? total;
    const batch = body.workflow_runs ?? [];
    runs.push(...batch);
    if (batch.length < LIST_PAGE_SIZE || runs.length >= total) break;
  }

  const { targets, backlog } = selectTargets(runs, { cutoff, maxDeletes });
  log(
    `${total} runs on the repository, ${backlog} completed older than ${keepDays}d, ` +
      `deleting ${dryRun ? 0 : targets.length}${dryRun ? ' (dry run)' : ''}`
  );

  let deleted = 0;
  let alreadyGone = 0;
  let failed = 0;
  let stoppedEarly = false;
  let cursor = 0;

  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= targets.length || stoppedEarly) return;
      if (api.budget <= QUOTA_FLOOR) {
        stoppedEarly = true;
        return;
      }

      const run = targets[index];
      if (dryRun) {
        log(`would delete ${run.id} (${run.created_at}) ${run.name ?? ''}`.trim());
        deleted++;
        continue;
      }

      let outcome = 'failed';
      for (let attempt = 0; attempt < NETWORK_ATTEMPTS; attempt++) {
        const response = await call(`${API}/repos/${repo}/actions/runs/${run.id}`, {
          method: 'DELETE',
        });
        if (response.status === 204) {
          outcome = 'deleted';
          break;
        }
        if (response.status === 404) {
          outcome = 'already gone';
          break;
        }
        if (response.status >= 500) {
          log(`retrying ${run.id} after ${response.status}`);
          continue;
        }
        log(`refused ${run.id}: ${response.status} ${(await response.text()).slice(0, 200)}`);
        break;
      }

      if (outcome === 'deleted') deleted++;
      else if (outcome === 'already gone') alreadyGone++;
      else failed++;
    }
  }

  await Promise.all(Array.from({ length: DELETE_CONCURRENCY }, () => worker()));

  if (stoppedEarly) log('request budget nearly spent; the rest converges on the next run');
  log(`deleted ${deleted}, already gone ${alreadyGone}, failed ${failed}`);

  summary(
    [
      '### Workflow run prune',
      '',
      '| | |',
      '| --- | --- |',
      `| Runs on the repository | ${total} |`,
      `| Completed older than ${keepDays}d | ${backlog} |`,
      `| Deleted | ${deleted}${dryRun ? ' (dry run)' : ''} |`,
      `| Already gone | ${alreadyGone} |`,
      `| Failed | ${failed} |`,
      `| Stopped on budget | ${stoppedEarly ? 'yes' : 'no'} |`,
      '',
    ].join('\n')
  );

  return { total, backlog, deleted, alreadyGone, failed, stoppedEarly, dryRun };
}

async function main() {
  const options = parseArgs(process.argv.slice(2), process.env);
  if (options.help) {
    console.log(USAGE);
    return;
  }

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  const result = await prune({
    token: options.token,
    repo: options.repo,
    keepDays: options.keepDays,
    maxDeletes: options.maxDeletes,
    dryRun: options.dryRun,
    log: (line) => console.log(line),
    summary: (markdown) => {
      if (!summaryPath) return;
      try {
        appendFileSync(summaryPath, markdown + '\n');
      } catch {
        // The summary is a convenience; a read-only path does not fail the job.
      }
    },
  });

  // A run that could not delete anything because the API refused every call is
  // worth failing on; a budget stop is not, and it is reported above.
  if (result.failed > 0 && result.deleted === 0 && result.alreadyGone === 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && /prune-workflow-runs\.mjs$/.test(process.argv[1].replaceAll('\\', '/'))) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
