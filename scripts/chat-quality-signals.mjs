#!/usr/bin/env node
/**
 * Implicit quality signals for نور, read from rows the assistant already writes.
 *
 * No schema change, no UI, no extra model call: the cost to users in tokens is
 * exactly zero. Every number here comes from `agent_turns` and `chat_messages`.
 *
 *   node scripts/chat-quality-signals.mjs --env D:\Projects\royaraqamia\.env --days 30
 *
 * Only aggregates are printed. Message bodies are read to detect a repeated
 * question, emails are read to separate harness traffic, and neither leaves
 * this process.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';

import { FAILURE_CODES } from '../shared/contracts/chat-agent-failures.mjs';
import { categorize, classifyAccount, harnessEmails } from './chat-quality-signals-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

function arg(name, fallback = '') {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? (process.argv[at + 1] ?? fallback) : fallback;
}

function loadEnvFile(path) {
  if (!path) return;
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`cannot read env file: ${path}`);
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || line.trim().startsWith('#')) continue;
    const value = match[2].replace(/^['"]|['"]$/g, '');
    if (value && !process.env[match[1]]) process.env[match[1]] = value;
  }
}

loadEnvFile(arg('env'));
const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(
  /\/+$/,
  ''
);
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!base || !key)
  throw new Error('need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (pass --env <file>)');

const days = Math.max(1, Number(arg('days', '30')) || 30);
const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
const PAGE = 1000;

async function readTable(table, select, windowed = true) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const url = new URL(`${base}/rest/v1/${table}`);
    url.searchParams.set('select', select);
    if (windowed) url.searchParams.set('created_at', `gte.${since}`);
    url.searchParams.set('order', 'created_at.asc');
    url.searchParams.set('limit', String(PAGE));
    url.searchParams.set('offset', String(offset));
    const response = await fetch(url, {
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok)
      throw new Error(`${table}: ${response.status} ${(await response.text()).slice(0, 200)}`);
    const batch = await response.json();
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
    offset += PAGE;
  }
}

const turns = await readTable(
  'agent_turns',
  'id,conversation_id,member_id,attempts,state,error,created_at'
);
const messages = await readTable(
  'chat_messages',
  'id,conversation_id,sender_kind,body,created_at,deleted_at,edited_at'
);
// Accounts, not turns: the owners of the rows above were created before the window.
const users = await readTable('users', 'id,email', false);
const harness = harnessEmails(process.env);
const accountOf = new Map(users.map((user) => [user.id, classifyAccount(user.email, harness)]));

const byThread = new Map();
for (const message of messages) {
  if (!byThread.has(message.conversation_id)) byThread.set(message.conversation_id, []);
  byThread.get(message.conversation_id).push(message);
}

const normalize = (text) =>
  String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

let repeatedQuestions = 0;
let shortFollowUps = 0;
let answeredTurns = 0;
for (const thread of byThread.values()) {
  thread.sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (let i = 1; i < thread.length; i += 1) {
    const current = thread[i];
    const previous = thread[i - 1];
    if (current.sender_kind !== 'user' || previous.sender_kind !== 'user') continue;
    if (current.deletedAt || previous.deletedAt) continue;
    const gap = Date.parse(current.created_at) - Date.parse(previous.created_at);
    if (gap < 0 || gap > 30 * 60 * 1000) continue;
    // A turn happened between the two user lines: the second is a retry or a
    // rephrase of the same question, not two independent questions.
    const answered = thread.slice(0, i).some((line) => line.sender_kind === 'agent');
    if (!answered) continue;
    answeredTurns += 1;
    if (normalize(current.body) === normalize(previous.body)) repeatedQuestions += 1;
    else if (normalize(current.body).length <= 12) shortFollowUps += 1;
  }
}

const failed = turns.filter((turn) => turn.state === 'failed').length;
const retried = turns.filter((turn) => turn.attempts > 0).length;
const accounts = {
  harness: { turns: 0, failed: 0 },
  member: { turns: 0, failed: 0 },
};
const errors = new Map();
let namedFailures = 0;
for (const turn of turns) {
  // An owner we cannot identify stays in the member bucket: never hide a failure.
  const account = accountOf.get(turn.member_id) ?? 'member';
  accounts[account].turns += 1;
  if (turn.state === 'failed') accounts[account].failed += 1;
  if (!turn.error) continue;
  const code = categorize(turn.error);
  if (turn.state === 'failed' && code !== 'other') namedFailures += 1;
  const entry = errors.get(code) ?? {
    code,
    count: 0,
    cause: FAILURE_CODES[code].cause,
    harness: 0,
    member: 0,
  };
  entry.count += 1;
  entry[account] += 1;
  errors.set(code, entry);
}
const topErrors = [...errors.values()].sort((a, b) => b.count - a.count);
const rate = (part, whole) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : 'n/a');
const report = {
  generatedAt: new Date().toISOString(),
  windowDays: days,
  turns: turns.length,
  failedTurns: failed,
  failedRate: rate(failed, turns.length),
  namedFailures,
  namedFailureRate: rate(namedFailures, failed),
  retriedTurns: retried,
  retriedRate: rate(retried, turns.length),
  answeredFollowUpPairs: answeredTurns,
  repeatedQuestions,
  repeatedRate: rate(repeatedQuestions, answeredTurns),
  shortFollowUps,
  shortFollowUpRate: rate(shortFollowUps, answeredTurns),
  accounts,
  failures: topErrors,
};

const lines = [
  '# Online quality signals',
  '',
  `${report.windowDays} day window, generated ${report.generatedAt}.`,
  '',
  'Derived from `agent_turns`, `chat_messages` and `users` only. No schema, UI',
  'or extra model call: zero token cost to members. Bodies and emails are read',
  'to classify rows, but neither is ever printed.',
  '',
  '| Signal | Count | Rate |',
  '| --- | ---: | ---: |',
  `| Assistant turns | ${report.turns} | - |`,
  `| Failed turns | ${report.failedTurns} | ${report.failedRate} |`,
  `| Failed turns with a named cause | ${report.namedFailures} | ${report.namedFailureRate} |`,
  `| Failed turns from harness accounts (of ${accounts.harness.turns}) | ${accounts.harness.failed} | ${rate(accounts.harness.failed, accounts.harness.turns)} |`,
  `| Failed turns from members (of ${accounts.member.turns}) | ${accounts.member.failed} | ${rate(accounts.member.failed, accounts.member.turns)} |`,
  `| Turns retried at least once | ${report.retriedTurns} | ${report.retriedRate} |`,
  `| Answered user-to-user pairs | ${report.answeredFollowUpPairs} | - |`,
  `| Repeated question after an answer | ${report.repeatedQuestions} | ${report.repeatedRate} |`,
  `| Short follow-up after an answer | ${report.shortFollowUps} | ${report.shortFollowUpRate} |`,
  '',
  '## Failure codes',
  '',
  ...(topErrors.length
    ? topErrors.map(
        (failure) =>
          `- ${failure.code}: ${failure.count} (harness ${failure.harness}, member ${failure.member}) — ${failure.cause}`
      )
    : ['None in this window.']),
  '',
  '## Account split',
  '',
  'Harness accounts are `E2E_TEST_EMAIL`, `E2E_VISUAL_EMAIL` and `ADMIN_EMAILS`.',
  'Their turns are test traffic, not member experience; an unknown owner stays',
  'in the member bucket so a failure is never hidden.',
  '',
  '| Account class | Turns | Failed | Failed rate |',
  '| --- | ---: | ---: | ---: |',
  `| harness | ${accounts.harness.turns} | ${accounts.harness.failed} | ${rate(accounts.harness.failed, accounts.harness.turns)} |`,
  `| member | ${accounts.member.turns} | ${accounts.member.failed} | ${rate(accounts.member.failed, accounts.member.turns)} |`,
  '',
  'A repeated question is a weak dissatisfaction proxy; a short follow-up such',
  'as "no" or "?" is weaker still. Neither is a verdict on one reply — they are',
  'trend lines to compare before and after a prompt change, and candidates for',
  'new cases in the simulated suite.',
  '',
];

const out = resolve(root, 'docs/assistant/online-signals.md');
writeFileSync(out, await prettier.format(lines.join('\n'), { parser: 'markdown' }));
process.stdout.write(`online signals: ${out}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
