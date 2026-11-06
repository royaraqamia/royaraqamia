#!/usr/bin/env node
/**
 * Agent spend, measured per run (ADR-0133).
 *
 * The OpenCode Go plan does not bill per token. It grants a monthly dollar
 * allowance, and every request counts at the model's list price, so the only
 * things that drain it faster are more work and peak-hour pricing. This script
 * is the single place that turns a finished step into a number:
 *
 *   `record` reads what the CLI on this runner reports for the project
 *   (`opencode stats --json`), writes one row to `public.agent_usage` and a line
 *   to the run summary. It never fails a job: no ledger secret, no CLI and an
 *   unrecognised JSON shape all end as "nothing recorded".
 *
 *   `gate` sums the allowance already recorded in the last five hours and the
 *   last seven days, and answers whether the plan's window is nearly spent.
 *   `soft=true` means "trim the optional work", never "stop": the callers are
 *   written so one round, one merge and every interactive turn still happen.
 *
 * The Console (Activity → Usage) remains the source of truth for the plan as a
 * whole, because it also counts usage this repository did not record - a TUI
 * session, another machine. This ledger is what the workflows can act on in the
 * minutes before a run, which the Console's CSV export cannot.
 *
 * Usage: node scripts/agents/usage.mjs record|gate
 */

import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Environment, trimmed, or empty. */
const env = (name) => (process.env[name] ?? '').trim();

function log(line) {
  process.stdout.write(`agent-usage: ${line}\n`);
}

function summary(line) {
  const path = env('GITHUB_STEP_SUMMARY');
  if (!path) return;
  try {
    appendFileSync(path, `${line}\n`);
  } catch {
    // A summary is a convenience; never let it fail the step.
  }
}

function output(name, value) {
  const path = env('GITHUB_OUTPUT');
  if (!path) return;
  try {
    appendFileSync(path, `${name}=${String(value).replace(/\r?\n/g, ' ')}\n`);
  } catch {
    // Same: the output is read by a later step, and its absence is a skip.
  }
}

/**
 * The CLI's own report for this project.
 *
 * `--project` scopes the totals to the checkout; a CLI that does not know the
 * flag answers non-zero, and the plain command is tried instead. A binary that
 * is absent (a step that never installed it) is not an error either.
 */
export function readStats(cwd = process.cwd(), binary = env('OPENCODE_BIN') || 'opencode') {
  const attempts = [
    ['stats', '--json', '--project', cwd],
    ['stats', '--json'],
  ];

  for (const args of attempts) {
    const result = spawnSync(binary, args, {
      cwd,
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) continue;
    const text = (result.stdout ?? '').trim();
    if (!text) continue;
    try {
      return JSON.parse(text);
    } catch {
      // A human report where JSON was asked for: try the next form.
      continue;
    }
  }
  return null;
}

const CONTAINERS = ['totals', 'total', 'summary', 'overall', 'all', 'usage'];

/** A finite number stored under one of `names`, directly or in a totals object. */
export function firstNumber(root, names) {
  if (!root || typeof root !== 'object') return null;
  const wanted = new Set(names);

  for (const name of names) {
    for (const container of [root, ...CONTAINERS.map((key) => root[key])]) {
      const value = container?.[name];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
  }

  // A shape this function has not seen: depth-first, first match wins. Numbers
  // parsed from strings are accepted because a CLI may print `"0.0041"`.
  const stack = [root];
  const seen = new Set();
  while (stack.length > 0) {
    const current = stack.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    for (const [key, value] of Object.entries(current)) {
      if (wanted.has(key)) {
        const parsed = typeof value === 'string' ? Number(value) : value;
        if (typeof parsed === 'number' && Number.isFinite(parsed)) return parsed;
      }
      if (value && typeof value === 'object') stack.push(value);
    }
  }
  return null;
}

const COST_KEYS = ['cost', 'costUsd', 'cost_usd', 'totalCost', 'total_cost', 'charged'];
const LIST_COST_KEYS = ['list_cost', 'listCost', 'allowance', 'allowanceUsd', 'allowance_usd'];

/**
 * The dollars this run counts against the Go allowance.
 *
 * On Go, the allowance a request counts and its list price are the same number
 * (the docs report both), so a CLI that only knows the local cost still gives a
 * usable figure. `cost` (balance charged) is the last resort: it is 0 for Go
 * usage inside its limits, which is why it is not the first choice.
 */
export function allowanceOf(stats) {
  return firstNumber(stats, LIST_COST_KEYS) ?? firstNumber(stats, COST_KEYS) ?? null;
}

function tokensOf(stats) {
  return {
    input: firstNumber(stats, ['input', 'inputTokens', 'input_tokens', 'prompt_tokens']),
    output: firstNumber(stats, ['output', 'outputTokens', 'output_tokens', 'completion_tokens']),
    cacheRead: firstNumber(stats, [
      'cacheRead',
      'cache_read',
      'cacheReadTokens',
      'cache_read_tokens',
      'cached',
    ]),
  };
}

function supabase() {
  const explicit = (env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL')).replace(/\/$/, '');
  const ref = env('SUPABASE_PROJECT_REF');
  const url = explicit || (ref ? `https://${ref}.supabase.co` : '');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  return url && key ? { url, key } : null;
}

function headers(key) {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
  };
}

/** One row per step; a retried step updates its own row. */
export async function record() {
  const stats = readStats();
  const allowance = allowanceOf(stats);
  const cost = firstNumber(stats, ['cost', 'costUsd', 'cost_usd', 'charged']);
  const tokens = tokensOf(stats);

  const workflow = env('WORKFLOW') || 'unknown';
  const round = env('ROUND') || 'all';
  const runId = env('RUN_ID') || env('GITHUB_RUN_ID') || 'local';
  const attempt = Number(env('RUN_ATTEMPT') || env('GITHUB_RUN_ATTEMPT') || '1') || 1;
  const runUrl =
    env('RUN_URL') ||
    (env('GITHUB_SERVER_URL') && env('GITHUB_REPOSITORY') && env('GITHUB_RUN_ID')
      ? `${env('GITHUB_SERVER_URL')}/${env('GITHUB_REPOSITORY')}/actions/runs/${env('GITHUB_RUN_ID')}`
      : null);

  if (!stats) {
    log(`no usage reported by the CLI for ${workflow}/${round}; nothing recorded.`);
    summary(`- ${workflow} (${round}): no usage reported (the CLI is absent or printed no JSON).`);
    return;
  }

  const dollars = allowance === null ? 'unknown' : `$${allowance.toFixed(4)}`;
  summary(`- ${workflow} (${round}): ${dollars} against the Go allowance.`);

  const db = supabase();
  if (!db) {
    log('no Supabase credentials; the measurement stays in the run summary.');
    return;
  }

  const row = {
    workflow,
    run_id: String(runId),
    attempt,
    round,
    run_url: runUrl,
    model: env('MODEL') || null,
    billing_source: env('BILLING_SOURCE') || null,
    cost_usd: cost,
    allowance_usd: allowance,
    input_tokens: tokens.input,
    output_tokens: tokens.output,
    cache_read_tokens: tokens.cacheRead,
    source: 'opencode-stats',
    raw: stats,
  };

  const response = await fetch(
    `${db.url}/rest/v1/agent_usage?on_conflict=workflow,run_id,attempt,round`,
    {
      method: 'POST',
      headers: { ...headers(db.key), prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row),
    }
  );

  if (!response.ok) {
    log(`the ledger refused the row: ${response.status} ${(await response.text()).slice(0, 200)}`);
    return;
  }
  log(`recorded ${workflow}/${round}: ${dollars}.`);
}

/** The sum of `allowance_usd` since `sinceMs` ago. `null` when unreadable. */
async function spentSince(db, sinceMs) {
  const since = new Date(Date.now() - sinceMs).toISOString();
  const response = await fetch(
    `${db.url}/rest/v1/agent_usage?select=total:allowance_usd.sum()&recorded_at=gte.${encodeURIComponent(since)}`,
    { headers: headers(db.key) }
  );
  if (!response.ok) return null;
  const rows = await response.json().catch(() => null);
  const total = Array.isArray(rows) ? rows[0]?.total : null;
  return typeof total === 'number' ? total : total === null ? 0 : Number(total) || null;
}

/**
 * Soft-exhaustion: the five-hour window is a fifth of the monthly allowance and
 * the week is half, so the defaults below are three quarters of each.
 */
export async function gate() {
  const db = supabase();
  if (!db) {
    log('no Supabase credentials; the gate stays open.');
    output('soft', 'false');
    output('reason', 'the usage ledger is not configured');
    return;
  }

  const capFive = Number(env('CAP_5H_USD') || '15');
  const capWeek = Number(env('CAP_WEEKLY_USD') || '40');

  let five = null;
  let week = null;
  try {
    five = await spentSince(db, FIVE_HOURS_MS);
    week = await spentSince(db, SEVEN_DAYS_MS);
  } catch (error) {
    log(`the ledger could not be read (${error.message}); the gate stays open.`);
    output('soft', 'false');
    output('reason', 'the usage ledger could not be read');
    return;
  }

  // A read that failed on one of the two windows fails open: blocking work on a
  // ledger we could not read is the failure mode this gate exists to avoid.
  if (five === null || week === null) {
    log('the ledger answered without totals; the gate stays open.');
    output('soft', 'false');
    output('reason', 'the usage ledger answered without totals');
    return;
  }

  output('allowance_5h_usd', five.toFixed(4));
  output('allowance_7d_usd', week.toFixed(4));

  const overFive = five >= capFive;
  const overWeek = week >= capWeek;
  const soft = overFive || overWeek;

  if (!soft) {
    log(
      `spent $${five.toFixed(2)} in 5h (cap $${capFive}) and $${week.toFixed(2)} in 7d (cap $${capWeek}).`
    );
    output('soft', 'false');
    output('reason', '');
    summary(
      `- Go allowance: $${five.toFixed(2)} of $${capFive} in the last 5h, $${week.toFixed(2)} of $${capWeek} in the last 7d.`
    );
    return;
  }

  const reason = overFive
    ? `the five-hour allowance is ${((five / capFive) * 100).toFixed(0)}% spent ($${five.toFixed(2)} of $${capFive})`
    : `the weekly allowance is ${((week / capWeek) * 100).toFixed(0)}% spent ($${week.toFixed(2)} of $${capWeek})`;

  log(`soft budget: ${reason}; optional work will be trimmed.`);
  output('soft', 'true');
  output('reason', reason);
  summary(`- Go allowance: **${reason}**; optional work trimmed (ADR-0133).`);
}

async function main() {
  const mode = process.argv[2] || env('MODE');
  if (mode === 'record') return record();
  if (mode === 'gate') return gate();
  throw new Error(`unknown mode '${mode}': expected 'record' or 'gate'`);
}

// A step that imports this module (the tests do) must not run it.
if (process.argv[1] && /usage\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main().catch((error) => {
    // Never fail the job: the caller marks the step `continue-on-error`, and an
    // error message is the whole of what a human needs from here.
    log(`skipped: ${error.message}`);
    output('soft', 'false');
  });
}
