#!/usr/bin/env node
/**
 * Agent spend, measured per run (ADR-0133).
 *
 * The OpenCode Go plan does not bill per token. It grants a monthly dollar
 * allowance, and every request counts at the model's list price, so the only
 * things that drain it faster are more work and peak-hour pricing. This script
 * is the single place that turns a finished step into a number:
 *
 *   `record` reads what the CLI on this runner reports for the project, writes
 *   one row to `public.agent_usage` and a line to the run summary. The JSON
 *   report is preferred and the human table is the last resort, because the
 *   binary the runners carry is not the one this file was written against: 1.x
 *   has no `--json` at all (issue #1497). It never fails a job: no ledger
 *   secret, no CLI and an unrecognised report all end as "nothing recorded".
 *
 *   `gate` sums the allowance already recorded in the last five hours, the
 *   last seven days and the last thirty days, and answers whether the plan's
 *   window is nearly spent. The ledger is read as plain rows and summed here:
 *   PostgREST refuses aggregates on this project, and a `.sum()` request that
 *   400s made the gate answer "not soft" for a day (issue #1497). `soft=true`
 *   means "trim the optional work", never "stop": the callers are written so one
 *   round, one merge and every interactive turn still happen.
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
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Environment, trimmed, or empty. */
const env = (name) => (process.env[name] ?? '').trim();

/**
 * Whether `at` falls inside DeepSeek V4.1 Flash's double-price window.
 *
 * The window is 01:00-04:00 and 06:00-10:00 UTC, Monday to Friday, and the Go
 * allowance counts list price, so the same work costs twice as much there. The
 * schedules are chosen off-peak; this is the second line of defence for a run that
 * was re-dispatched by a catch-up or drifted past its start.
 */
export function isPeakPrice(at = new Date()) {
  const day = at.getUTCDay(); // 0 = Sunday
  const hour = at.getUTCHours();
  const weekday = day >= 1 && day <= 5;
  return weekday && ((hour >= 1 && hour < 4) || (hour >= 6 && hour < 10));
}

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

const ARABIC_INDIC_DIGITS = /[\u0660-\u0669]/g;
const PERSIAN_DIGITS = /[\u06f0-\u06f9]/g;

/**
 * The same digits in ASCII, whatever locale the CLI printed in.
 *
 * `opencode stats` formats its table with the machine's digits and separators,
 * so an Arabic-locale box prints its session count in Arabic-Indic numerals
 * (issue #1497). A runner is `en-US` and unaffected; this keeps the parser
 * honest everywhere else, like `toLatinDigits` in `shared/contracts/text.ts`
 * does for input.
 */
function latinDigits(text) {
  return text
    .replace(ARABIC_INDIC_DIGITS, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(PERSIAN_DIGITS, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

/**
 * The `Total Cost` line of a 1.x `opencode stats` report, as dollars.
 *
 * 1.x has no machine-readable report: `stats --json` prints its help and exits
 * 1, while `stats` prints the COST & TOKENS block with `Total Cost` in it
 * (issue #1497). The table is a rendering, so this is the documented last
 * resort and never the first choice; `null` when the block is not there, which
 * is what a help screen looks like.
 */
export function allowanceFromTable(text) {
  const plain = latinDigits(String(text ?? ''));
  const match = plain.match(
    /^\s*[│|]\s*Total Cost\s+\$\s*([0-9][0-9.,\u066b\u066c]*)\s*[│|]?\s*$/m
  );
  if (!match) return null;
  const value = Number(match[1].replace(/\u066b/g, '.').replace(/[,\u066c]/g, ''));
  return Number.isFinite(value) ? value : null;
}

/**
 * A CLI report as a stats object: the JSON payload when the binary answers one,
 * otherwise `{ cost }` from the human table.
 *
 * `report` names the form the number came from, because the two are not the
 * same measurement: JSON carries the token breakdown as well, and a table row
 * is only ever the dollars.
 */
export function statsFromText(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // Not JSON: the human table below is the only other form.
  }

  const cost = allowanceFromTable(trimmed);
  return cost === null ? null : { cost, report: 'human-table' };
}

/**
 * The CLI's own report for this project.
 *
 * The binary is whatever the workflow installed, and the two generations in use
 * disagree on how to ask: `@opencode/cli` 2.x answers `stats --json`, while
 * `opencode-ai` 1.x - the binary Issue Implementer and Issue Planner run - has
 * no `--json` flag and prints help with exit 1 (issue #1497). The JSON forms are
 * tried first and the plain table last.
 *
 * `--project` takes a project id, or `.` for the current directory: an absolute
 * path is accepted *silently* by 2.x and reports `sessions: 0, cost: 0`, which
 * would be recorded as a measured zero instead of as unknown. A binary that is
 * absent (a step that never installed it) is not an error either.
 */
export function readStats(cwd = process.cwd(), binary = env('OPENCODE_BIN') || 'opencode') {
  const attempts = [
    ['stats', '--json', '--project', '.'],
    ['stats', '--json'],
    // 1.x only, and a runner is a single project, so the machine-wide total is
    // this checkout's total.
    ['stats'],
  ];

  for (const args of attempts) {
    const result = spawnSync(binary, args, {
      cwd,
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) continue;
    const stats = statsFromText(result.stdout ?? '');
    if (stats) return stats;
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

  const identity = {
    workflow,
    run_id: String(runId),
    attempt,
    round,
    run_url: runUrl,
    model: env('MODEL') || null,
    billing_source: env('BILLING_SOURCE') || null,
  };

  // A step the clock killed reports nothing, and for a long time that meant it
  // left no row either: a round could spend ninety minutes of the allowance and
  // be invisible to the cap it is measured against. The row is written with no
  // dollar figure rather than a guess, so the ledger can be asked how many
  // rounds went unmeasured (ADR-0142).
  if (!stats) {
    const reason = 'the CLI reported no usage for this step (no readable `opencode stats` payload)';
    log(`no usage reported by the CLI for ${workflow}/${round}; recording it as unreported.`);
    summary(`- ${workflow} (${round}): usage unreported (${reason}).`);
    await writeRow({
      ...identity,
      cost_usd: null,
      allowance_usd: null,
      input_tokens: null,
      output_tokens: null,
      cache_read_tokens: null,
      source: 'unreported',
      raw: { reason },
    });
    return;
  }

  const dollars = allowance === null ? 'unknown' : `$${allowance.toFixed(4)}`;
  summary(`- ${workflow} (${round}): ${dollars} against the Go allowance.`);

  await writeRow({
    ...identity,
    cost_usd: cost,
    allowance_usd: allowance,
    input_tokens: tokens.input,
    output_tokens: tokens.output,
    cache_read_tokens: tokens.cacheRead,
    source: 'opencode-stats',
    raw: stats,
  });
  log(`recorded ${workflow}/${round}: ${dollars}.`);
}

/** Upsert one ledger row. Best-effort: a missing secret or a refused row is a line, not a failure. */
async function writeRow(row) {
  const db = supabase();
  if (!db) {
    log('no Supabase credentials; the measurement stays in the run summary.');
    return false;
  }

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
    return false;
  }
  return true;
}

/** PostgREST's own row ceiling: one page, so a window is read in as few requests as possible. */
const PAGE_SIZE = 1000;
/** 50 pages is 50,000 rows; a window larger than that is unreadable, not spent. */
const MAX_PAGES = 50;

/**
 * Sum `allowance_usd` over ledger rows.
 *
 * A `null` is a step nobody measured (ADR-0142), which is not the same as a step
 * that cost nothing: it is skipped and counted, so the caller can say how many
 * it left out instead of quietly reading them as zero. PostgREST answers
 * `numeric(12, 6)` as a JSON number on this project, and a string is accepted
 * too, because a proxy or a typed client may hand one back.
 */
export function sumAllowance(rows) {
  let total = 0;
  let counted = 0;
  let skipped = 0;

  for (const row of rows ?? []) {
    const raw = row?.allowance_usd;
    const value = typeof raw === 'string' ? Number(raw) : raw;
    if (typeof value === 'number' && Number.isFinite(value)) {
      total += value;
      counted += 1;
    } else {
      skipped += 1;
    }
  }

  return { total, counted, skipped };
}

/**
 * The sum of `allowance_usd` since `sinceMs` ago.
 *
 * Read as plain rows and summed here: PostgREST refuses aggregate functions on
 * this project (`PGRST123`), and the `.sum()` this used to ask for answered 400
 * on every call, so the gate stayed open for a day (issue #1497). The filter is
 * covered by `idx_agent_usage_recorded_at`.
 *
 * `null` means the window could not be read - a refused page, or more rows than
 * `MAX_PAGES` reaches - and the caller must fail open on it rather than treat a
 * truncated read as the whole picture. A window that is genuinely empty sums to
 * `{ total: 0, counted: 0, skipped: 0 }`.
 */
async function spentSince(db, sinceMs) {
  const since = new Date(Date.now() - sinceMs).toISOString();
  const rows = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await fetch(
      `${db.url}/rest/v1/agent_usage?select=allowance_usd` +
        `&recorded_at=gte.${encodeURIComponent(since)}` +
        // `id` breaks ties: without it two rows written in the same instant can
        // swap places between pages and one of them is never counted.
        `&order=recorded_at.desc,id.desc&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
      { headers: headers(db.key) }
    );
    if (!response.ok) return null;

    const batch = await response.json().catch(() => null);
    if (!Array.isArray(batch)) return null;
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return sumAllowance(rows);
  }

  log(`more than ${PAGE_SIZE * MAX_PAGES} rows in one window; the gate stays open.`);
  return null;
}

/**
 * Which window, if any, is near its limit (ADR-0133).
 *
 * The plan cuts a month into a five-hour window (a fifth) and a week (half); the
 * month itself is the one that refuses a call outright once it is spent, so the
 * gate reads all three. Exported so the arithmetic is tested without a fetch
 * mock, and so the reason line always names the window that answered.
 */
export function softVerdict({ five, week, month }, { capFive, capWeek, capMonth }) {
  const windows = [
    { label: 'the five-hour allowance', spent: five, cap: capFive },
    { label: 'the weekly allowance', spent: week, cap: capWeek },
    { label: 'the monthly allowance', spent: month, cap: capMonth },
  ];
  const over = windows.find((window) => window.spent >= window.cap);
  if (!over) return { soft: false, reason: '' };
  return {
    soft: true,
    reason:
      `${over.label} is ${((over.spent / over.cap) * 100).toFixed(0)}% spent ` +
      `($${over.spent.toFixed(2)} of $${over.cap})`,
  };
}

/**
 * Soft-exhaustion: the five-hour window is a fifth of the monthly allowance and
 * the week is half, so the defaults below are three quarters of each. The month
 * is read too: it is the window whose exhaustion refuses every call, and the
 * 2026-11-06 run burned six ninety-minute rounds on it without this gate saying
 * anything.
 */
export async function gate() {
  // The clock answer does not need the ledger, and every caller reads a missing output
  // as "not peak" (fail open), so it is written before anything can return early.
  output('peak', String(isPeakPrice()));

  const db = supabase();
  if (!db) {
    log('no Supabase credentials; the gate stays open.');
    output('soft', 'false');
    output('reason', 'the usage ledger is not configured');
    return;
  }

  const capFive = Number(env('CAP_5H_USD') || '15');
  const capWeek = Number(env('CAP_WEEKLY_USD') || '40');
  const capMonth = Number(env('CAP_MONTHLY_USD') || '75');

  let five = null;
  let week = null;
  let month = null;
  try {
    [five, week, month] = await Promise.all([
      spentSince(db, FIVE_HOURS_MS),
      spentSince(db, SEVEN_DAYS_MS),
      spentSince(db, THIRTY_DAYS_MS),
    ]);
  } catch (error) {
    log(`the ledger could not be read (${error.message}); the gate stays open.`);
    output('soft', 'false');
    output('reason', 'the usage ledger could not be read');
    return;
  }

  // A read that failed on one of the windows fails open: blocking work on a
  // ledger we could not read is the failure mode this gate exists to avoid.
  if (five === null || week === null || month === null) {
    log('the ledger answered without totals; the gate stays open.');
    output('soft', 'false');
    output('reason', 'the usage ledger answered without totals');
    return;
  }

  // An unmeasured row is unknown spend, not zero: say how much of the window the
  // sum is blind to, so a gate that reads low is visible rather than trusted.
  if (month.skipped > 0) {
    log(
      `${month.skipped} row(s) in the last 30 days carry no measurement (ADR-0142); ` +
        'they are skipped rather than counted as zero.'
    );
  }

  output('allowance_5h_usd', five.total.toFixed(4));
  output('allowance_7d_usd', week.total.toFixed(4));
  output('allowance_30d_usd', month.total.toFixed(4));

  const verdict = softVerdict(
    { five: five.total, week: week.total, month: month.total },
    { capFive, capWeek, capMonth }
  );

  if (!verdict.soft) {
    log(
      `spent $${five.total.toFixed(2)} in 5h (cap $${capFive}), $${week.total.toFixed(2)} in 7d ` +
        `(cap $${capWeek}) and $${month.total.toFixed(2)} in 30d (cap $${capMonth}).`
    );
    output('soft', 'false');
    output('reason', '');
    summary(
      `- Go allowance: $${five.total.toFixed(2)} of $${capFive} in the last 5h, ` +
        `$${week.total.toFixed(2)} of $${capWeek} in the last 7d, ` +
        `$${month.total.toFixed(2)} of $${capMonth} in the last 30d.`
    );
    return;
  }

  log(`soft budget: ${verdict.reason}; optional work will be trimmed.`);
  output('soft', 'true');
  output('reason', verdict.reason);
  summary(`- Go allowance: **${verdict.reason}**; optional work trimmed (ADR-0133).`);
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
