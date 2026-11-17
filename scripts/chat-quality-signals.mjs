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
 * question, but never leave this process.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';

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

async function readTable(table, select) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const url = new URL(`${base}/rest/v1/${table}`);
    url.searchParams.set('select', select);
    url.searchParams.set('created_at', `gte.${since}`);
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

const turns = await readTable('agent_turns', 'id,conversation_id,attempts,state,error,created_at');
const messages = await readTable(
  'chat_messages',
  'id,conversation_id,sender_kind,body,created_at,deleted_at,edited_at'
);

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
const errors = new Map();
const categorize = (error) => {
  const text = String(error);
  if (text.includes('تعذّر الحصول على ردّ')) return 'provider_failure';
  if (text.includes('غير متاحة')) return 'unavailable';
  if (text.includes(' تحويل الصوت') || text.includes('تحويل الصوت')) return 'transcription_failure';
  if (text.includes('المستند') || text.includes('المرفق')) return 'file_failure';
  if (text.includes('الاشتراك') || text.includes('الخطط')) return 'allowance';
  return 'other';
};
for (const turn of turns) {
  if (!turn.error) continue;
  const code = categorize(turn.error);
  errors.set(code, (errors.get(code) ?? 0) + 1);
}
const topErrors = [...errors.entries()].sort((a, b) => b[1] - a[1]);
const rate = (part, whole) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : 'n/a');
const report = {
  generatedAt: new Date().toISOString(),
  windowDays: days,
  turns: turns.length,
  failedTurns: failed,
  failedRate: rate(failed, turns.length),
  retriedTurns: retried,
  retriedRate: rate(retried, turns.length),
  answeredFollowUpPairs: answeredTurns,
  repeatedQuestions,
  repeatedRate: rate(repeatedQuestions, answeredTurns),
  shortFollowUps,
  shortFollowUpRate: rate(shortFollowUps, answeredTurns),
  topErrors: Object.fromEntries(topErrors),
};

const lines = [
  '# Online quality signals',
  '',
  `${report.windowDays} day window, generated ${report.generatedAt}.`,
  '',
  'Derived from `agent_turns` and `chat_messages` only. No schema, UI or extra',
  'model call: zero token cost to members. Bodies are read but never printed.',
  '',
  '| Signal | Count | Rate |',
  '| --- | ---: | ---: |',
  `| Assistant turns | ${report.turns} | - |`,
  `| Failed turns | ${report.failedTurns} | ${report.failedRate} |`,
  `| Turns retried at least once | ${report.retriedTurns} | ${report.retriedRate} |`,
  `| Answered user-to-user pairs | ${report.answeredFollowUpPairs} | - |`,
  `| Repeated question after an answer | ${report.repeatedQuestions} | ${report.repeatedRate} |`,
  `| Short follow-up after an answer | ${report.shortFollowUps} | ${report.shortFollowUpRate} |`,
  '',
  '## Failure codes',
  '',
  ...(topErrors.length
    ? topErrors.map(([code, count]) => `- ${code}: ${count}`)
    : ['None in this window.']),
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
