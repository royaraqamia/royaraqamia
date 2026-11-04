#!/usr/bin/env node
/**
 * Telegram bridge for the autonomous issue pipeline.
 *
 * Why this exists: the planner and the implementer run unattended, and the only
 * way to ask them for something, or to hear what they did, was to open GitHub.
 * The owner works from a phone; the bridge is the phone's door. It is a
 * dispatcher, not an agent: it never checks out a repository and never writes
 * code. It files an issue and lets the workflows that already own that job do
 * the work (ADR 0121).
 *
 * A plain message is answered, not filed. The owner asked for that explicitly:
 * a sentence that is not a task must not become an issue, so writing is behind
 * `/task` and `/now` and reading is the default. The answer is the bridge's one
 * model call - a chat completion with no tools and no repository access, which
 * is also why it cannot do anything to the repo by accident.
 *
 * Why the webhook and not polling: a poll pays its interval whether or not
 * anybody wrote anything - five minutes of latency, 288 workflow runs a day - and
 * the owner wanted seconds. Telegram now pushes each update to
 * `supabase/functions/telegram`, which stores it and dispatches this workflow.
 * Runs scale with messages instead of with the clock, and a quiet day costs
 * nothing. Vercel is still untouched: the endpoint is a Supabase Edge Function
 * (ADR 0122).
 *
 * Why the message log lives in Postgres: Actions has no memory between runs, and
 * the function stores the update *before* it dispatches. A dispatch that never
 * starts leaves an unprocessed row, which `drain` picks up - that is the whole
 * backstop. `update_id` is unique because Telegram retries an update it could not
 * deliver, and a retry must not file a second issue.
 *
 * Usage:
 *   node scripts/telegram-bridge.mjs drain
 *   node scripts/telegram-bridge.mjs remind
 *   node scripts/telegram-bridge.mjs digest --workflow "Issue Planner" --url ...
 *   node scripts/telegram-bridge.mjs alerts --workflow "Migration Drift" --conclusion failure --url ...
 *
 * Required env:
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *   SUPABASE_URL (or SUPABASE_PROJECT_REF), SUPABASE_SERVICE_ROLE_KEY
 *   GITHUB_TOKEN, GITHUB_REPOSITORY
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const DEFAULT_REPO = 'royaraqamia';

const MAX_TELEGRAM = 4000;
const DEFAULT_TZ_MINUTES = 180;
const INFERENCE_URL = 'https://opencode.ai/inference/go/openai/v1/chat/completions';
const MODEL = 'deepseek-v4.1-flash';
const TRANSCRIBE_MODELS = ['mimo-v2.6-flash', 'gemini-4-argon'];
// A voice note that cannot be transcribed is not retried forever: after this many
// attempts the row is answered once and left alone.
const MAX_VOICE_ATTEMPTS = 3;
const SYSTEM_PROMPT = [
  'أنت صديق مقرّب ومستشار موثوق لأيهم، تكتب بالعربية الطبيعية بلا تكلّف ولا نبرة رسمية.',
  'أجب عن أي شيء يسأله: الكود، العمل، الحياة، الأفكار، الآراء، التخطيط — كما يفعل صديق ذكي وصريح.',
  'كن مباشراً وصادقاً: إن كان لك رأي فقلْه، وإن لم تكن متأكداً فقل ذلك بدل أن تخمّن.',
  'أسماء الملفات والأوامر والتقنيات تبقى بالإنجليزية كما هي.',
  'ترى آخر رسائل محادثتكما فقط، ولا ترى المستودع ولا الإنترنت، ولا تعدّل الكود بنفسك:',
  'إن طلب تعديلاً في الكود فقل إن ذلك يحتاج /task أو /now، وإلا فلا تذكر الأوامر إطلاقاً.',
  'لا تدّعِ أنك نفّذت شيئاً لم يُنفّذ، ولا تخترع أرقام issues أو أسماء فروع.',
].join(' ');

/**
 * The escalation switch. The chat has no tools of its own - it cannot read a
 * file or open a page - so when a question needs evidence the model calls this
 * and the answer arrives from a run that has both. Saying "I need to check" is
 * the honest option; guessing is the one this prevents.
 */
const LOOKUP_TOOL = {
  type: 'function',
  function: {
    name: 'lookup',
    description:
      'اطلب دليلاً حقيقياً قبل الإجابة: من ملفات المستودع (repo) أو من صفحة/بحث على الإنترنت (web). استخدمها حين تعتمد الإجابة على ملف أو سطر أو معلومة حديثة.',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', enum: ['repo', 'web'] },
        query: { type: 'string', description: 'ما تبحث عنه، أو رابط الصفحة' },
      },
      required: ['source', 'query'],
    },
  },
};

const env = (name) => process.env[name]?.trim() || '';

export function botToken() {
  return env('TELEGRAM_BOT_TOKEN');
}

export function allowedChat() {
  return env('TELEGRAM_CHAT_ID');
}

export function supabaseUrl() {
  const explicit = env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL');
  if (explicit) return explicit.replace(/\/$/, '');
  const ref = env('SUPABASE_PROJECT_REF');
  return ref ? `https://${ref}.supabase.co` : '';
}

export function supabaseKey() {
  return env('SUPABASE_SERVICE_ROLE_KEY');
}

/** Owner and repository the digest reports on; the token decides the rest. */
export function githubTarget() {
  const [owner, repo] = (env('GITHUB_REPOSITORY') || `${DEFAULT_REPO}/${DEFAULT_REPO}`).split('/');
  return { owner, repo };
}

// ---------------------------------------------------------------- pure helpers

/**
 * Splits `/command arguments` from plain text. Only a known word counts as a
 * command, so a message that starts with a path (`/community/fix`) is still a
 * task.
 */
export function parseCommand(text) {
  const trimmed = String(text ?? '').trim();
  const match = /^\/([a-z]+)(?:@[\w_]+)?(?:\s+([\s\S]*))?$/i.exec(trimmed);
  if (!match) return { command: null, args: trimmed };
  const command = match[1].toLowerCase();
  const known = ['task', 'now', 'remind', 'tz', 'help'];
  if (!known.includes(command)) return { command: null, args: trimmed };
  return { command, args: (match[2] ?? '').trim() };
}

/**
 * Splits `repo: task` from a message. The caller decides whether the name is a
 * real repository before using it, so a sentence that happens to contain a colon
 * ("fix: the login bug") stays a task in the default repository.
 */
export function parseTarget(text) {
  const trimmed = String(text ?? '').trim();
  const match = /^([A-Za-z0-9._-]{1,100}):\s*([\s\S]+)$/.exec(trimmed);
  // `https://…` also looks like `name: body`; a scheme is not a repository.
  if (!match || match[2].startsWith('//')) return { repo: null, body: trimmed };
  return { repo: match[1], body: match[2].trim() };
}

/** `+3`, `-5.5`, `UTC+3`, `03:00`, `Asia/Damascus` -> minutes east of UTC. */
export function parseOffset(input) {
  const text = String(input ?? '').trim();
  if (!text) return null;
  const named = {
    'asia/damascus': 180,
    damascus: 180,
    utc: 0,
    gmt: 0,
    london: 0,
    riyadh: 180,
    dubai: 240,
    cairo: 120,
    istanbul: 180,
  };
  const lower = text.toLowerCase();
  if (lower in named) return { minutes: named[lower], name: text };
  const numeric = /^(?:utc|gmt)?\s*([+-]?\d{1,2})(?::(\d{2}))?$/i.exec(text);
  if (!numeric) return null;
  const sign = numeric[1].startsWith('-') ? -1 : 1;
  const hours = Math.abs(Number(numeric[1]));
  const minutes = numeric[2] ? Number(numeric[2]) : 0;
  if (hours > 14 || minutes > 59) return null;
  return { minutes: sign * (hours * 60 + minutes), name: text };
}

/** Renders an offset the way a person writes it: +03:00. */
export function formatOffset(minutes) {
  const sign = minutes < 0 ? '-' : '+';
  const absolute = Math.abs(minutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
  const rest = String(absolute % 60).padStart(2, '0');
  return `${sign}${hours}:${rest}`;
}

/**
 * Reads `in 30m`, `in 2h`, `in 1d`, or a wall clock time (`09:30`) interpreted in
 * the chat's own offset. Returns the instant, unshifted, and what is left of the
 * text after the time expression.
 */
export function parseWhen(text, nowMs, tzOffsetMinutes) {
  const source = String(text ?? '').trim();
  const relative =
    /^in\s+(\d{1,3})\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)\b\s*([\s\S]*)$/i.exec(
      source
    );
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    const factor = unit.startsWith('m') ? 60_000 : unit.startsWith('h') ? 3_600_000 : 86_400_000;
    return { at: new Date(nowMs + amount * factor), rest: relative[3].trim() };
  }

  const clock = /^(\d{1,2}):(\d{2})\s+([\s\S]*)$/.exec(source);
  if (clock) {
    const hours = Number(clock[1]);
    const minutes = Number(clock[2]);
    if (hours > 23 || minutes > 59) return null;
    const local = new Date(nowMs + tzOffsetMinutes * 60_000);
    const target = Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate(),
      hours,
      minutes
    );
    let at = target - tzOffsetMinutes * 60_000;
    if (at <= nowMs) at += 86_400_000;
    return { at: new Date(at), rest: clock[3].trim() };
  }

  return null;
}

/** Telegram rejects a message over 4096 characters; split on lines, not bytes. */
export function chunkMessage(text, limit = MAX_TELEGRAM) {
  const chunks = [];
  let current = '';
  for (const line of String(text ?? '').split('\n')) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= limit) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    current = line.length > limit ? line.slice(0, limit) : line;
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [''];
}

export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * The model answers in markdown-ish prose but Telegram is given HTML: escape
 * first, then turn `code` spans into <code>, so a stray angle bracket cannot
 * break the message and an inline command reads as code rather than as a
 * literal backtick pair.
 *
 * Each span opens with U+200E (LEFT-TO-RIGHT MARK). Without it the bidi
 * algorithm treats the leading `/` of `/task` as neutral and moves it to the
 * visual end inside an Arabic paragraph, which is why the first live replies
 * rendered `task/` — the command read like a path, not a command.
 */
export function renderAnswer(text) {
  return escapeHtml(text).replace(/`([^`\n]{1,300})`/g, '<code>\u200E$1</code>');
}

/** A code span for a command, with the same direction guard as an answer. */
export function commandSpan(text) {
  return `<code>\u200E${escapeHtml(text)}</code>`;
}

export function repoPath(owner, repo) {
  return `${owner}/${repo || DEFAULT_REPO}`;
}

// -------------------------------------------------------------- the digest text

const conclusionArabic = {
  success: 'ناجح',
  failure: 'فاشل',
  cancelled: 'ملغى',
  skipped: 'متجاوز',
};

/**
 * The planner's and the implementer's summaries answer the same question - what
 * did this workflow do in the last 24 hours - and differ only in what they
 * produce: issues or merged pull requests. One template, two nouns.
 */
export function formatDigest({ workflow, runs, items, url }) {
  const noun = workflow.includes('Planner') ? 'مهام جديدة' : 'تغييرات مدموجة';
  const lines = [`🗓 <b>${escapeHtml(workflow)}</b> — آخر 24 ساعة`];

  if (!runs.length) {
    lines.push('لا تشغيلات مسجلة.');
  } else {
    const successes = runs.filter((run) => run.conclusion === 'success').length;
    const failures = runs.filter((run) => run.conclusion === 'failure').length;
    lines.push(`التشغيلات: ${successes} ناجح · ${failures} فاشل`);
    const latest = runs[0];
    const label = conclusionArabic[latest.conclusion] ?? latest.conclusion ?? 'غير معروف';
    const link = latest.html_url
      ? ` — <a href="${escapeHtml(latest.html_url)}">عرض التشغيل</a>`
      : '';
    lines.push(`آخر تشغيل: ${label}${link}`);
  }

  if (items.length) {
    lines.push('', `<b>${noun}:</b> ${items.length}`);
    for (const item of items.slice(0, 12)) {
      lines.push(
        `• <a href="${escapeHtml(item.html_url)}">#${item.number}</a> ${escapeHtml(item.title)}`
      );
    }
    if (items.length > 12) lines.push(`… و${items.length - 12} أخرى`);
  } else {
    lines.push('', `${noun}: لا شيء.`);
  }

  if (url) lines.push('', `<a href="${escapeHtml(url)}">سجل التشغيل الكامل</a>`);
  return lines.join('\n');
}

export function formatAlert({ workflow, conclusion, url, repo }) {
  const label = conclusionArabic[conclusion] ?? conclusion ?? 'غير معروف';
  return [
    `⚠️ <b>${escapeHtml(workflow)}</b> — ${label}`,
    `المستودع: <code>${escapeHtml(repoPath(...repo))}</code>`,
    url ? `<a href="${escapeHtml(url)}">فتح التشغيل</a>` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// -------------------------------------------------------------------- transport

async function telegram(method, payload) {
  const token = botToken();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.description ?? response.status}`);
  }
  return data.result;
}

/** Sends HTML text, split into chunks Telegram will accept. */
export async function sendMessage(chatId, text) {
  for (const chunk of chunkMessage(text)) {
    await telegram('sendMessage', {
      chat_id: chatId,
      text: chunk,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  }
}

function supabaseHeaders() {
  const key = supabaseKey();
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
  };
}

async function db(path, init = {}) {
  const base = supabaseUrl();
  if (!base || !supabaseKey()) throw new Error('Supabase URL or service role key is not set');
  const response = await fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: { ...supabaseHeaders(), ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Supabase ${path} failed: ${response.status} ${body.slice(0, 300)}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function github(path, init = {}) {
  const token = env('GITHUB_TOKEN');
  if (!token) throw new Error('GITHUB_TOKEN is not set');
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': 'royaraqamia-telegram-bridge/1.0',
      'x-github-api-version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`GitHub ${path} failed: ${response.status} ${body.slice(0, 300)}`);
  }
  return response.status === 204 ? null : response.json();
}

// ---------------------------------------------------------------- the model

/**
 * One chat completion. `tools` is what lets the answer route ask for evidence
 * instead of inventing it.
 */
async function askModel(messages, { model = MODEL, tools } = {}) {
  const key = env('OPENCODE_API_KEY');
  if (!key) throw new Error('OPENCODE_API_KEY is not set');

  const response = await fetch(INFERENCE_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      'user-agent': 'royaraqamia-telegram-bridge/1.0',
      'x-opencode-session': 'bridge',
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages,
      ...(tools ? { tools, tool_choice: 'auto' } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`inference failed: ${response.status} ${body.slice(0, 300)}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message ?? {};
}

/**
 * Turns a voice note into text. `deepseek-v4.1-flash` takes no audio; this one
 * does.
 */
function permanent(message) {
  const error = new Error(message);
  error.permanent = true;
  return error;
}

/** Turns a voice note into text. `deepseek-v4.1-flash` takes no audio; this one does. */
async function transcribe(fileId) {
  const file = await telegram('getFile', { file_id: fileId });
  if (!file?.file_path) throw permanent('Telegram returned no file path for this voice note');

  // `/file/bot<token>/<path>`: without `/file` this answers 404 every time, which
  // is exactly what every voice note did before 2026-11-04.
  const url = `https://api.telegram.org/file/bot${botToken()}/${file.file_path}`;
  const audio = await fetch(url);
  if (!audio.ok) {
    const detail = `${audio.status} (${file.file_path})`;
    // A 404 means the file is gone, and no retry brings it back.
    throw audio.status === 404
      ? permanent(`لم يعد Telegram يوفّر هذا الملف الصوتي: ${detail}`)
      : new Error(`downloading the voice note failed: ${detail}`);
  }

  const ogg = Buffer.from(await audio.arrayBuffer());

  // Telegram voice notes are OGG/OPUS. The probe (2026-11-04) showed the audio
  // model receiving audio tokens, so the container is worth converting before
  // asking it to listen: a 16 kHz mono WAV is the form every audio path accepts.
  const wav = toWav(ogg);
  const candidates = [
    ...(wav ? [{ data: wav.toString('base64'), format: 'wav' }] : []),
    { data: ogg.toString('base64'), format: 'ogg' },
  ];

  // Cheapest first, and a failure steps over instead of ending the attempt.
  // `gemini-4-argon` answered 503 twice in a row, so it is tried last.
  let lastError;
  for (const model of TRANSCRIBE_MODELS) {
    for (const candidate of candidates) {
      try {
        const message = await askModel(
          [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'حوّل هذا الصوت إلى نص عربي كما قيل، بلا تعليق ولا إضافة. إن لم تسمع صوتاً فاكتب: صمت.',
                },
                { type: 'input_audio', input_audio: candidate },
              ],
            },
          ],
          { model }
        );

        const text = String(message.content ?? message.audio_transcript ?? '').trim();
        if (text) {
          process.stdout.write(`telegram: ${model} transcribed the ${candidate.format}\n`);
          return text;
        }
        process.stdout.write(`telegram: ${model} returned no transcript (${candidate.format})\n`);
      } catch (error) {
        lastError = error;
        process.stdout.write(
          `telegram: ${model} failed on ${candidate.format}: ${String(error.message).slice(0, 160)}\n`
        );
      }
    }
  }

  throw new Error(
    `لم أستطع تحويل الصوت إلى نص${lastError ? ` (${String(lastError.message).slice(0, 120)})` : ''}`
  );
}

/** Telegram's OGG/OPUS to 16 kHz mono WAV, when the runner has ffmpeg. */
export function toWav(input) {
  try {
    return execFileSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        'pipe:0',
        '-ar',
        '16000',
        '-ac',
        '1',
        '-f',
        'wav',
        'pipe:1',
      ],
      { input, maxBuffer: 40_000_000 }
    );
  } catch {
    return null;
  }
}

/**
 * Real evidence for an escalated question. `repo` greps the checkout the runner
 * already has; `web` fetches the URL it was given, or the search page when the
 * question is a phrase. Bounded on purpose: a few kilobytes beats a transcript.
 */
function repoEvidence(query) {
  const words = query
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}_.-]/gu, ''))
    .filter((word) => word.length > 2)
    .slice(0, 6);
  if (!words.length) return '';

  try {
    const output = execFileSync(
      'rg',
      [
        '--line-number',
        '--ignore-case',
        '--max-count',
        '3',
        '--max-columns',
        '200',
        '--glob',
        '!node_modules',
        '--glob',
        '!.git',
        '-e',
        words.join('|'),
        '.',
      ],
      { encoding: 'utf8', maxBuffer: 2_000_000 }
    );
    return output.slice(0, 6000);
  } catch {
    return '';
  }
}

async function webEvidence(query) {
  const trimmed = query.trim();
  const target = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://html.duckduckgo.com/html/?q=${encodeURIComponent(trimmed)}`;

  const response = await fetch(target, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; royaraqamia-bridge/1.0)' },
  });
  if (!response.ok) return '';

  const html = await response.text();
  const text = html
    // `[^>]*` because a browser closes on `</script >` and `</script foo>` too,
    // and a stripper that only knows the exact form leaves tags in the text.
    .replace(/<script[\s\S]*?<\/script[^>]*>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

  return text.slice(0, 6000);
}

// ------------------------------------------------------------------- state

async function ensureChat(chatId, title) {
  await db('telegram_chats', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      chat_id: chatId,
      title: title ?? null,
      last_seen_at: new Date().toISOString(),
    }),
  });
  const rows = await db(`telegram_chats?chat_id=eq.${chatId}&select=tz_offset_minutes`);
  return rows?.[0] ?? { tz_offset_minutes: DEFAULT_TZ_MINUTES };
}

/**
 * Marks one inbound row as taken, and reports whether this run got it. The
 * filter is the compare-and-set: two overlapping runs - the webhook's dispatch
 * and the fifteen-minute backstop - cannot both handle one message.
 */
async function claimRow(row) {
  const claimed = await db(
    `telegram_messages?id=eq.${row.id}&direction=eq.in&processed_at=is.null`,
    {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({ processed_at: new Date().toISOString() }),
    }
  );
  return Boolean(claimed?.length);
}

async function recordOutbound(chatId, body, repo) {
  await db('telegram_messages', {
    method: 'POST',
    body: JSON.stringify({ chat_id: chatId, direction: 'out', body, repo }),
  });
}

/**
 * The last few exchanges, as the model's only memory. A rolling summary would be
 * cheaper to read but nothing wrote one - and the first live conversation showed
 * exactly what that costs: "جميل أعجبتني هذا الأمر" arrived with no idea what
 * "هذا" was, and the answer said so. Ten rows is a paragraph or two, which is
 * accurate, cheap, and bounded whatever the conversation length.
 */
async function recentHistory(chatId, beforeId) {
  const filter = beforeId ? `&id=lt.${beforeId}` : '';
  const rows =
    (await db(
      `telegram_messages?chat_id=eq.${chatId}${filter}&select=direction,body,created_at&order=id.desc&limit=10`
    )) ?? [];
  return rows.reverse();
}

async function memoriesFor(chatId) {
  return (
    (await db(`telegram_memories?chat_id=eq.${chatId}&select=content&order=id.desc&limit=40`)) ?? []
  );
}

async function summaryFor(chatId) {
  const rows = await db(`telegram_summaries?chat_id=eq.${chatId}&select=summary`);
  return rows?.[0]?.summary ?? '';
}

/** What the answer route knows before it reads the message. */
async function contextFor(chatId, messageId) {
  const [history, memories, summary] = await Promise.all([
    recentHistory(chatId, messageId),
    memoriesFor(chatId),
    summaryFor(chatId),
  ]);
  return formatContext({
    summary,
    memories: formatMemories(memories),
    history: formatHistory(history),
  });
}

/** Renders history the way a person reads it: what they said, what came back. */
export function formatHistory(rows) {
  return rows
    .filter((row) => row?.body)
    .map((row) => `${row.direction === 'in' ? 'المستخدم' : 'المساعد'}: ${row.body}`)
    .join('\n');
}

/** The distilled memory, one bullet per fact, bounded so it cannot become a prompt. */
export function formatMemories(rows, limit = 40) {
  const seen = new Set();
  const lines = [];
  for (const row of rows) {
    const content = String(row?.content ?? '').trim();
    if (!content || seen.has(content)) continue;
    seen.add(content);
    lines.push(`• ${content}`);
    if (lines.length >= limit) break;
  }
  return lines.join('\n');
}

/** Everything the answer route knows before it reads the message itself. */
export function formatContext({ summary, memories, history }) {
  return [
    memories ? `ما تعرفه عن أيهم من قبل:\n${memories}` : '',
    summary ? `ملخّص المحادثات السابقة:\n${summary}` : '',
    history ? `آخر الرسائل:\n${history}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

let reposOfPromise = null;

/** Names the token can see, loaded once per run rather than once per message. */
async function knownRepos() {
  const { owner } = githubTarget();
  reposOfPromise ??= github(`/users/${owner}/repos?per_page=100&sort=updated`)
    .then((rows) => new Set((rows ?? []).map((row) => row.name)))
    .catch(() => new Set());
  return reposOfPromise;
}

// ------------------------------------------------------------------- routing

async function createIssue(owner, repo, title, body, labels) {
  return github(`/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    body: JSON.stringify({ title, body, labels }),
  });
}

/** First line becomes the title, so the issue reads like the message did. */
function titleAndBody(body) {
  const [first, ...rest] = body.split('\n');
  const title = (first ?? '').trim().slice(0, 120) || 'مهمة من Telegram';
  const remainder = rest.join('\n').trim();
  return { title, body: remainder || body };
}

async function handleTask({ text, chat, fast, messageId }) {
  const { owner } = githubTarget();
  const parsed = parseTarget(text);
  const repos = await knownRepos();
  const repo = parsed.repo && repos.has(parsed.repo) ? parsed.repo : DEFAULT_REPO;
  const task = repo === parsed.repo ? parsed.body : text;
  const { title, body } = titleAndBody(task);
  const context = await contextFor(chat, messageId);

  const issue = await createIssue(
    owner,
    repo,
    fast ? title : `[telegram] ${title}`,
    [
      'Filed from Telegram.',
      '',
      body,
      '',
      context ? `<details><summary>السياق من المحادثة</summary>\n\n${context}\n\n</details>` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    fast ? [] : ['ready-for-agent']
  );

  if (fast) {
    await github(`/repos/${owner}/${repo}/issues/${issue.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: `/oc ${task}` }),
    });
  }

  const line = fast
    ? `⚡ فتحت <a href="${issue.html_url}">#${issue.number}</a> في <code>${repo}</code> وشغّلت ${commandSpan('/oc')}. سيصل الطلب مفتوحاً لمراجعتك.`
    : `📥 سجّلت <a href="${issue.html_url}">#${issue.number}</a> في <code>${repo}</code> بالوسم <code>ready-for-agent</code>. سينفّذها Implementer في دورته القادمة ويدمجها إذا كان الفحص أخضر.`;
  await sendMessage(chat, line);
  await recordOutbound(chat, line, repo);
}

async function handleRemind({ args, chat, offset }) {
  const when = parseWhen(args, Date.now(), offset);
  if (!when || !when.rest) {
    const line = `اكتب التذكير هكذا: ${commandSpan('/remind 09:30')} نص التذكير أو ${commandSpan('/remind in 30m')} نص التذكير.`;
    await sendMessage(chat, line);
    await recordOutbound(chat, line, null);
    return;
  }

  await db('telegram_reminders', {
    method: 'POST',
    body: JSON.stringify({ chat_id: chat, body: when.rest, due_at: when.at.toISOString() }),
  });

  const stamp = new Intl.DateTimeFormat('ar', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(when.at.getTime() + offset * 60_000));
  const line = `⏰ سجّلت التذكير عند ${stamp} (UTC${formatOffset(offset)}).`;
  await sendMessage(chat, line);
  await recordOutbound(chat, line, null);
}

async function handleTimezone({ args, chat }) {
  const parsed = parseOffset(args);
  if (!parsed) {
    const line = `لم أفهم المنطقة الزمنية. مثال: ${commandSpan('/tz +3')} أو ${commandSpan('/tz Asia/Damascus')}.`;
    await sendMessage(chat, line);
    await recordOutbound(chat, line, null);
    return;
  }
  await db(`telegram_chats?chat_id=eq.${chat}`, {
    method: 'PATCH',
    body: JSON.stringify({ tz_offset_minutes: parsed.minutes, tz_name: parsed.name }),
  });
  const line = `✅ صارت منطقتك <code>UTC${formatOffset(parsed.minutes)}</code>. كل reminder بعد الآن يُحسب بها.`;
  await sendMessage(chat, line);
  await recordOutbound(chat, line, null);
}

/**
 * The one model call in the bridge. Plain text is a question, not a task, so it
 * is answered here; the answer route has no tools and no repository, which is
 * what keeps a chatty message from touching anything. The last few exchanges are
 * the only context it gets, so a long conversation costs a paragraph.
 */
async function handleAnswer({ text, chat, messageId }) {
  if (!env('OPENCODE_API_KEY')) {
    const line = `الإجابات معطّلة: <code>OPENCODE_API_KEY</code> غير مضبوط. استخدم ${commandSpan('/task')} للمهام.`;
    await sendMessage(chat, line);
    await recordOutbound(chat, line, null);
    return;
  }

  const context = await contextFor(chat, messageId);
  const message = await askModel(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      ...(context ? [{ role: 'system', content: context }] : []),
      { role: 'user', content: text },
    ],
    { tools: [LOOKUP_TOOL] }
  );

  const call = message.tool_calls?.[0];
  if (call?.function?.name === 'lookup') {
    let args = {};
    try {
      args = JSON.parse(call.function.arguments ?? '{}');
    } catch {
      args = {};
    }
    const source = args.source === 'web' ? 'web' : 'repo';
    const query = String(args.query ?? text).slice(0, 300);

    await db('telegram_lookups', {
      method: 'POST',
      body: JSON.stringify({ chat_id: chat, source, query }),
    });

    const ack =
      source === 'web'
        ? '🔎 سأتحقق من الإنترنت، وأعود خلال دقائق.'
        : '🔎 سأقرأ في المستودع، وأعود خلال دقائق.';
    await sendMessage(chat, ack);
    await recordOutbound(chat, ack, null);
    return;
  }

  const answer = String(message.content ?? '').trim();
  const line = answer ? renderAnswer(answer) : 'لم أستطع صياغة إجابة. جرّب صياغة أخرى.';
  await sendMessage(chat, line);
  await recordOutbound(chat, line, null);
}

const HELP = [
  '<b>الأوامر</b>',
  `${commandSpan('/task')} نص المهمة — تسجيلها كـ issue بالوسم <code>ready-for-agent</code> (Auto-merge إذا كان الفحص أخضر).`,
  `${commandSpan('/now')} نص المهمة — تشغيلها فوراً بـ ${commandSpan('/oc')}، وتتوقف عند pull request مفتوح لتراجعه.`,
  `${commandSpan('/remind 09:30')} النص — أو ${commandSpan('/remind in 30m')} النص.`,
  `${commandSpan('/tz +3')} — المنطقة الزمنية، مرة واحدة.`,
  `${commandSpan('repo-name:')} بعد ${commandSpan('/task')} — تنفيذ المهمة في مستودع آخر.`,
  'أي رسالة عادية أجيب عليها فقط، بلا issue وبلا تغيير في المستودع.',
  'إن احتاج جوابي إلى ملف في المستودع أو إلى صفحة على الإنترنت فسأقول ذلك وأتحقق ثم أعود.',
  'يمكنك إرسال رسالة صوتية وسأحوّلها إلى نص وأتعامل معها كرسالة عادية.',
].join('\n');

async function handleMessage({ chat, text, messageId }) {
  if (String(chat) !== String(allowedChat())) return;

  const trimmed = (text ?? '').trim();
  if (!trimmed) return;

  const chatRow = await ensureChat(chat, null);
  const offset = chatRow.tz_offset_minutes ?? DEFAULT_TZ_MINUTES;
  const { command, args } = parseCommand(trimmed);

  if (command === 'help') {
    await sendMessage(chat, HELP);
    await recordOutbound(chat, null, null);
    return;
  }

  if (command === 'tz') return handleTimezone({ args, chat });
  if (command === 'remind') return handleRemind({ args, chat, offset });

  if ((command === 'task' || command === 'now') && !args) {
    await sendMessage(chat, HELP);
    await recordOutbound(chat, null, null);
    return;
  }

  if (command === 'task' || command === 'now') {
    return handleTask({ text: args, chat, fast: command === 'now', messageId });
  }

  return handleAnswer({ text: trimmed, chat, messageId });
}

/**
 * Handles what the webhook stored and could not finish, and retries what a
 * previous run failed on. The webhook is the fast path; this is the one that
 * makes a GitHub outage, a rotated token or a slow dispatch survivable.
 */
async function drain() {
  // A digest a trigger missed is reported before anything else: a failed agent
  // run is the thing worth knowing first.
  await catchUpDigests().catch(() => {});

  const rows =
    (await db(
      'telegram_messages?direction=eq.in&processed_at=is.null&select=id,chat_id,body,voice_file_id,attempts&order=id.asc&limit=20'
    )) ?? [];

  process.stdout.write(`telegram: ${rows.length} unprocessed message(s)\n`);

  for (const row of rows) {
    if (!(await claimRow(row))) continue;
    try {
      // A voice note is transcribed here, not in the function: the webhook has
      // seconds and no model, and the drain already holds the bot token.
      const text = row.voice_file_id ? await transcribe(row.voice_file_id) : row.body;
      if (row.voice_file_id && text) {
        await db(`telegram_messages?id=eq.${row.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ body: `🎙️ ${text}` }),
        });
      }
      // Silence is the worst answer: say the note arrived and was not understood.
      if (!String(text ?? '').trim()) {
        const line = '🎙️ وصلت الرسالة الصوتية لكن لم أستطع تحويلها إلى نص. أعد إرسالها أو اكتبها.';
        await sendMessage(row.chat_id, line);
        await recordOutbound(row.chat_id, line, null);
        continue;
      }
      await handleMessage({ chat: row.chat_id, text, messageId: row.id });
    } catch (error) {
      await handleFailure(row, error);
    }
  }
}

/**
 * One apology per message, not one every five minutes. A row is released for
 * another attempt while its count is below the limit, and afterwards it stays
 * processed - the chat is told once, and the loop terminates.
 */
async function handleFailure(row, error) {
  const attempts = Number(row.attempts ?? 0) + 1;
  // A permanent failure (a file Telegram no longer serves) is final on the first
  // attempt; a transient one is retried.
  const final = error?.permanent === true || attempts >= MAX_VOICE_ATTEMPTS;

  await db(`telegram_messages?id=eq.${row.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ attempts, processed_at: final ? new Date().toISOString() : null }),
  }).catch(() => {});

  process.stdout.write(
    `telegram: message ${row.id} failed (attempt ${attempts}): ${String(error.message).slice(0, 200)}\n`
  );

  if (!final || String(row.chat_id) !== String(allowedChat())) return;

  const line = `⚠️ تعذّر تنفيذ الرسالة: ${escapeHtml(String(error.message).slice(0, 300))}`;
  await sendMessage(row.chat_id, line).catch(() => {});
  await recordOutbound(row.chat_id, line, null).catch(() => {});
}

/**
 * Answers what the chat escalated. The evidence is gathered first and handed to
 * the model as data, so the reply can cite a path or a link instead of sounding
 * confident about something it never saw.
 */
async function lookups() {
  const rows =
    (await db(
      'telegram_lookups?answered_at=is.null&select=id,chat_id,source,query&order=id.asc&limit=5'
    )) ?? [];

  process.stdout.write(`telegram: ${rows.length} pending lookup(s)\n`);

  for (const row of rows) {
    const claimed = await db(`telegram_lookups?id=eq.${row.id}&answered_at=is.null`, {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({ answered_at: new Date().toISOString() }),
    });
    if (!claimed?.length) continue;

    try {
      const evidence =
        row.source === 'web' ? await webEvidence(row.query) : repoEvidence(row.query);
      const message = await askModel([
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'system',
          content:
            'فيما يلي مقتطفات حقيقية جُمعت الآن من المصدر المطلوب. أجب عنها وحدها، واذكر المسارات أو الروابط إن وجدت. إن كانت لا تكفي فقل ذلك صراحةً ولا تخمّن.',
        },
        {
          role: 'user',
          content: `السؤال: ${row.query}\n\nما وجدته:\n${evidence || '(لم أجد شيئاً)'}`,
        },
      ]);

      const answer =
        String(message.content ?? '').trim() || 'لم أجد ما يكفي للإجابة عن هذا السؤال.';
      await sendMessage(row.chat_id, renderAnswer(answer));
      await recordOutbound(row.chat_id, answer, null);
    } catch (error) {
      // Given back so the next run retries it rather than losing the question.
      await db(`telegram_lookups?id=eq.${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ answered_at: null }),
      }).catch(() => {});
      await sendMessage(
        row.chat_id,
        `⚠️ تعذّر التحقق: ${escapeHtml(String(error.message).slice(0, 300))}`
      ).catch(() => {});
    }
  }
}

/**
 * What "it learns what I like" honestly means: the model reads the exchanges it
 * has not distilled yet, keeps a rolling summary and the durable facts, and
 * advances the cursor. The weights never change; the context does, and every row
 * is readable and deletable in `telegram_memories`.
 */
const REMEMBER_PROMPT = [
  'اقرأ هذه المحادثة بين أيهم والمساعد، وأعد كائن JSON فقط بلا أي نص آخر، بالشكل:',
  '{"summary": "...", "memories": [{"kind": "preference|fact|project", "content": "..."}]}',
  'الملخّص: فقرة قصيرة تصف ما جرى وما يهم في المحادثة، بالعربية.',
  'الذكريات: حقائق دائمة فقط تستحق التذكّر لاحقاً — تفضيلات أيهم، طريقة عمله، قرارات اتخذها، تفاصيل عن مشروعه أو وقته.',
  'كل ذكرى جملة واحدة قصيرة ≤ 200 حرف. لا تخترع شيئاً لم يُقل. لا تكرّر ما هو واضح من السياق.',
  'إن لم يوجد ما يستحق التذكّر فأعد {"summary": "...", "memories": []}.',
].join('\n');

/** Reads a JSON object out of a model answer that may be wrapped in a code fence. */
export function parseMemory(text) {
  const raw = String(text ?? '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return { summary: '', memories: [] };

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    const memories = Array.isArray(parsed.memories)
      ? parsed.memories
          .filter((row) => row && typeof row.content === 'string')
          .map((row) => ({
            kind: ['preference', 'fact', 'project'].includes(row.kind) ? row.kind : 'fact',
            content: row.content.trim().slice(0, 200),
          }))
          .filter((row) => row.content.length > 3)
          .slice(0, 6)
      : [];
    return {
      summary: String(parsed.summary ?? '')
        .trim()
        .slice(0, 2000),
      memories,
    };
  } catch {
    return { summary: '', memories: [] };
  }
}

async function remember() {
  const chat = allowedChat();
  if (!chat) return;

  const cursorRows = await db('telegram_state?key=eq.memory_cursor&select=value');
  const cursor = Number(cursorRows?.[0]?.value ?? 0);

  const rows =
    (await db(
      `telegram_messages?chat_id=eq.${chat}&id=gt.${cursor}&select=id,direction,body&order=id.asc&limit=100`
    )) ?? [];

  // Six is where a distillation starts to beat reading the messages themselves.
  if (rows.length < 6) return;

  const message = await askModel([
    { role: 'system', content: REMEMBER_PROMPT },
    { role: 'user', content: formatHistory(rows) },
  ]);
  const { summary, memories } = parseMemory(message.content);

  process.stdout.write(`telegram: remembered ${memories.length} fact(s)\n`);

  if (summary) {
    await db('telegram_summaries', {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        chat_id: chat,
        summary,
        covers_until: rows[rows.length - 1].id,
        updated_at: new Date().toISOString(),
      }),
    });
  }

  for (const row of memories) {
    await db('telegram_memories', {
      method: 'POST',
      headers: { prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({ chat_id: chat, kind: row.kind, content: row.content }),
    });
  }

  await db('telegram_state', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      key: 'memory_cursor',
      value: String(rows[rows.length - 1].id),
      updated_at: new Date().toISOString(),
    }),
  });
}

/**
 * Measures, on demand, whether the gateway actually transcribes. A voice note
 * that returns 200 with no text is indistinguishable from a model that ignored
 * the audio, so this sends a known one-second tone to each candidate and prints
 * the raw status and body. Run it with `workflow_dispatch` and read the log.
 */
export function silenceWav(seconds = 1, sampleRate = 8000) {
  const samples = seconds * sampleRate;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  return buffer;
}

async function probe() {
  const key = env('OPENCODE_API_KEY');
  if (!key) throw new Error('OPENCODE_API_KEY is not set');

  const data = silenceWav().toString('base64');
  for (const model of [...TRANSCRIBE_MODELS, MODEL]) {
    const response = await fetch(INFERENCE_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        'user-agent': 'royaraqamia-telegram-bridge/1.0',
        // The gateway answers 400 MissingSessionID without this.
        'x-opencode-session': 'probe',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'اكتب أي كلمة تسمعها، أو اكتب: صمت.' },
              { type: 'input_audio', input_audio: { data, format: 'wav' } },
            ],
          },
        ],
      }),
    });

    const body = await response.text().catch(() => '');
    process.stdout.write(`probe ${model}: ${response.status} ${body.slice(0, 600)}\n`);
  }
}

// ------------------------------------------------------------------ summaries

async function remind() {
  const due = encodeURIComponent(new Date().toISOString());
  const rows =
    (await db(
      `telegram_reminders?sent_at=is.null&due_at=lte.${due}&select=id,chat_id,body&order=due_at.asc&limit=20`
    )) ?? [];

  for (const row of rows) {
    const line = `⏰ <b>تذكير</b>\n${escapeHtml(row.body)}`;
    await sendMessage(row.chat_id, line);
    // Only after the send succeeded: a failure stays pending and is retried on
    // the next poll instead of disappearing.
    await db(`telegram_reminders?id=eq.${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ sent_at: new Date().toISOString() }),
    });
  }
}

async function digest({ workflow, url, runId }) {
  const { owner, repo } = githubTarget();
  const chat = allowedChat();
  if (!chat) throw new Error('TELEGRAM_CHAT_ID is not set');

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const file = workflow.includes('Planner') ? 'issue-planner.yml' : 'issue-implementer.yml';
  const runs =
    (await github(
      `/repos/${owner}/${repo}/actions/workflows/${file}/runs?per_page=10&created=${encodeURIComponent(
        `>=${since}`
      )}`
    ).then((data) => data?.workflow_runs ?? [])) ?? [];

  let items = [];
  if (workflow.includes('Planner')) {
    // `since` on the issues endpoint filters by *updated* time, so a comment on an
    // old issue counted it as new - the first digest reported 16 where the
    // planner files at most five. The list is fetched and filtered on creation.
    const issues =
      (await github(`/repos/${owner}/${repo}/issues?state=all&sort=created&per_page=50`)) ?? [];
    items = issues.filter((issue) => !issue.pull_request && issue.created_at >= since);
  } else {
    const pulls =
      (await github(
        `/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=30`
      )) ?? [];
    items = pulls.filter((pull) => pull.merged_at && pull.merged_at >= since);
  }

  const text = formatDigest({ workflow, runs, items, url });
  await sendMessage(chat, text);
  await recordOutbound(chat, text, repo);
  if (runId) {
    await db('telegram_digests', {
      method: 'POST',
      headers: { prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({ run_id: runId, workflow }),
    });
  }
}

/**
 * Sends any digest a trigger missed. `workflow_run` is the fast path and it
 * failed for the implementer on 2026-11-04, so a run that finds itself wide
 * awake (the thirty-minute tick) also looks back six hours and reports what has
 * no receipt.
 */
async function catchUpDigests() {
  const { owner, repo } = githubTarget();
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const receipts =
    (await db(`telegram_digests?select=run_id&sent_at=gte.${encodeURIComponent(since)}`)) ?? [];
  const seen = new Set(receipts.map((row) => Number(row.run_id)));

  for (const [workflow, file] of [
    ['Issue Planner', 'issue-planner.yml'],
    ['Issue Implementer', 'issue-implementer.yml'],
  ]) {
    const runs =
      (await github(
        `/repos/${owner}/${repo}/actions/workflows/${file}/runs?per_page=5&created=${encodeURIComponent(
          `>=${since}`
        )}`
      ).then((data) => data?.workflow_runs ?? [])) ?? [];

    for (const run of runs) {
      if (run.status !== 'completed' || seen.has(Number(run.id))) continue;
      await digest({ workflow, url: run.html_url, runId: run.id });
    }
  }
}

async function alerts({ workflow, conclusion, url }) {
  const chat = allowedChat();
  if (!chat) throw new Error('TELEGRAM_CHAT_ID is not set');
  if (conclusion === 'success' || conclusion === 'skipped') return;
  const { owner, repo } = githubTarget();
  const text = formatAlert({ workflow, conclusion, url, repo: [owner, repo] });
  await sendMessage(chat, text);
  await recordOutbound(chat, text, repo);
}

// ---------------------------------------------------------------------- entry

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'drain') return drain();
  if (mode === 'lookup') return lookups();
  if (mode === 'remember') return remember();
  if (mode === 'probe') return probe();
  if (mode === 'remind') return remind();
  if (mode === 'digest') {
    return digest({
      workflow: arg('workflow') ?? 'Issue Planner',
      url: arg('url'),
    });
  }
  if (mode === 'alerts') {
    return alerts({
      workflow: arg('workflow') ?? 'Release Health',
      conclusion: arg('conclusion') ?? 'failure',
      url: arg('url'),
    });
  }
  throw new Error(`Unknown mode: ${mode}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
