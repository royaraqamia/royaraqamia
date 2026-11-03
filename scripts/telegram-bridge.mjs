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
 * Why polling and not a webhook: a webhook needs a public HTTPS endpoint, which
 * means Vercel - and this project's Vercel Hobby account already exceeded its
 * Fluid Active CPU cap once (docs/vercel-usage.md). The repository is public, so
 * Actions minutes are free, and `getUpdates` with a stored offset gives the same
 * guarantee without touching a Vercel meter. Latency is one polling interval
 * (five minutes), inside the owner's tolerance for asynchronous work.
 *
 * Why the offset and the message log live in Postgres: Actions has no memory
 * between runs. `update_id` is unique in `telegram_messages` because Telegram
 * redelivers an update whenever a run dies after receiving it, and a redelivery
 * must not file a second issue. The row is written *before* the issue is filed,
 * so the constraint is the deduplication, not a check that races it.
 *
 * Usage:
 *   node scripts/telegram-bridge.mjs poll
 *   node scripts/telegram-bridge.mjs remind
 *   node scripts/telegram-bridge.mjs digest --workflow "Issue Planner" --conclusion success --url ...
 *   node scripts/telegram-bridge.mjs alerts --workflow "Migration Drift" --conclusion failure --url ...
 *
 * Required env:
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *   SUPABASE_URL (or SUPABASE_PROJECT_REF), SUPABASE_SERVICE_ROLE_KEY
 *   GITHUB_TOKEN, GITHUB_REPOSITORY
 */

import { pathToFileURL } from 'node:url';

export const DEFAULT_REPO = 'royaraqamia';

const MAX_TELEGRAM = 4000;
const DEFAULT_TZ_MINUTES = 180;
const INFERENCE_URL = 'https://opencode.ai/inference/go/openai/v1/chat/completions';
const MODEL = 'deepseek-v4.1-flash';
const SYSTEM_PROMPT = [
  'أنت مساعد المطوّر في مستودع royaraqamia على GitHub.',
  'أجب بإيجاز وبالعربية، وأبقِ أسماء الملفات والأوامر والوسوم بالإنجليزية كما هي.',
  'أنت لا تعدّل الكود ولا تفتح مشاكل بنفسك: إن طلب المستخدم مهمة أو إصلاحاً،',
  'أرشده إلى /task (تُسجَّل ويُنفّذها الوكيل) أو /now (تشتغل فوراً وتتوقف عند pull request).',
  'لا تدّعِ أنك نفّذت شيئاً لم يُنفّذ، ولا تخترع أرقام issues أو أسماء فروع.',
].join(' ');

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

// ------------------------------------------------------------------- state

async function readOffset() {
  const rows = await db('telegram_state?key=eq.update_offset&select=value');
  return rows?.[0]?.value ? Number(rows[0].value) : 0;
}

async function writeOffset(offset) {
  await db('telegram_state', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      key: 'update_offset',
      value: String(offset),
      updated_at: new Date().toISOString(),
    }),
  });
}

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
 * Writes the inbound row first and reports whether it is new. Telegram
 * redelivers an update after a failed run; the unique `update_id` is what turns
 * that redelivery into a no-op instead of a second issue.
 */
async function claimUpdate(update, chatId, body) {
  const inserted = await db('telegram_messages?on_conflict=update_id', {
    method: 'POST',
    headers: { prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({
      chat_id: chatId,
      update_id: update.update_id,
      direction: 'in',
      body,
    }),
  });
  return Boolean(inserted?.length);
}

async function recordOutbound(chatId, body, repo) {
  await db('telegram_messages', {
    method: 'POST',
    body: JSON.stringify({ chat_id: chatId, direction: 'out', body, repo }),
  });
}

async function summaryFor(chatId) {
  const rows = await db(`telegram_summaries?chat_id=eq.${chatId}&select=summary`);
  return rows?.[0]?.summary ?? '';
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

async function handleTask({ text, chat, fast }) {
  const { owner } = githubTarget();
  const parsed = parseTarget(text);
  const repos = await knownRepos();
  const repo = parsed.repo && repos.has(parsed.repo) ? parsed.repo : DEFAULT_REPO;
  const task = repo === parsed.repo ? parsed.body : text;
  const { title, body } = titleAndBody(task);
  const summary = await summaryFor(chat);

  const issue = await createIssue(
    owner,
    repo,
    fast ? title : `[telegram] ${title}`,
    [
      'Filed from Telegram.',
      '',
      body,
      '',
      summary ? `<details><summary>السياق من المحادثة</summary>\n\n${summary}\n\n</details>` : '',
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
    ? `⚡ فتحت <a href="${issue.html_url}">#${issue.number}</a> في <code>${repo}</code> وشغّلت <code>/oc</code>. سيصل الطلب مفتوحاً لمراجعتك.`
    : `📥 سجّلت <a href="${issue.html_url}">#${issue.number}</a> في <code>${repo}</code> بالوسم <code>ready-for-agent</code>. سينفّذها Implementer في دورته القادمة ويدمجها إذا كان الفحص أخضر.`;
  await sendMessage(chat, line);
  await recordOutbound(chat, line, repo);
}

async function handleRemind({ args, chat, offset }) {
  const when = parseWhen(args, Date.now(), offset);
  if (!when || !when.rest) {
    const line =
      'اكتب التذكير هكذا: <code>/remind 09:30 نص التذكير</code> أو <code>/remind in 30m نص التذكير</code>.';
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
    const line =
      'لم أفهم المنطقة الزمنية. مثال: <code>/tz +3</code> أو <code>/tz Asia/Damascus</code>.';
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
 * what keeps a chatty message from touching anything. The rolling summary is the
 * only context it gets, so an old conversation costs a paragraph, not a transcript.
 */
async function handleAnswer({ text, chat }) {
  const key = env('OPENCODE_API_KEY');
  if (!key) {
    const line =
      'الإجابات معطّلة: <code>OPENCODE_API_KEY</code> غير مضبوط. استخدم <code>/task</code> للمهام.';
    await sendMessage(chat, line);
    await recordOutbound(chat, line, null);
    return;
  }

  const summary = await summaryFor(chat);
  const response = await fetch(INFERENCE_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      'user-agent': 'royaraqamia-telegram-bridge/1.0',
      'x-opencode-session': String(chat),
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.4,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...(summary ? [{ role: 'system', content: `سياق سابق من المحادثة: ${summary}` }] : []),
        { role: 'user', content: text },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`inference failed: ${response.status} ${body.slice(0, 300)}`);
  }

  const data = await response.json();
  const answer = (data?.choices?.[0]?.message?.content ?? '').trim();
  const line = answer || 'لم أستطع صياغة إجابة. جرّب صياغة أخرى.';
  await sendMessage(chat, line);
  await recordOutbound(chat, line, null);
}

const HELP = [
  '<b>الأوامر</b>',
  '/task نص المهمة — تسجيلها كـ issue بالوسم <code>ready-for-agent</code> (Auto-merge إذا كان الفحص أخضر).',
  '/now نص المهمة — تشغيلها فوراً بـ <code>/oc</code>، وتتوقف عند pull request مفتوح لتراجعه.',
  '/remind 09:30 النص — أو <code>/remind in 30m النص</code>.',
  '/tz +3 — المنطقة الزمنية، مرة واحدة.',
  '<code>repo-name: …</code> بعد /task — تنفيذ المهمة في مستودع آخر.',
  'أي رسالة عادية أجيب عليها فقط، بلا issue وبلا تغيير في المستودع.',
].join('\n');

async function handleUpdate(update) {
  const message = update.message ?? update.edited_message;
  if (!message?.chat) return;
  const chat = message.chat.id;
  if (String(chat) !== String(allowedChat())) return;

  const text = (message.text ?? '').trim();
  if (!text) return;

  // Claimed before anything acts: a redelivered update stops here.
  if (!(await claimUpdate(update, chat, text))) return;

  const chatRow = await ensureChat(chat, message.chat.title ?? message.chat.username ?? null);
  const offset = chatRow.tz_offset_minutes ?? DEFAULT_TZ_MINUTES;
  const { command, args } = parseCommand(text);

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
    return handleTask({ text: args, chat, fast: command === 'now' });
  }

  return handleAnswer({ text, chat });
}

async function poll() {
  let offset = await readOffset();
  const updates =
    (await telegram('getUpdates', { offset, timeout: 0, allowed_updates: ['message'] })) ?? [];

  for (const update of updates) {
    try {
      await handleUpdate(update);
    } catch (error) {
      const chat = update.message?.chat?.id;
      if (chat && String(chat) === String(allowedChat())) {
        await sendMessage(
          chat,
          `⚠️ تعذّر تنفيذ الرسالة: ${escapeHtml(String(error.message).slice(0, 300))}`
        );
      }
    }
    offset = Math.max(offset, update.update_id + 1);
    await writeOffset(offset);
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

async function digest({ workflow, url }) {
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
    const issues =
      (await github(
        `/repos/${owner}/${repo}/issues?state=all&since=${encodeURIComponent(since)}&per_page=30`
      )) ?? [];
    items = issues.filter((issue) => !issue.pull_request);
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
  if (mode === 'poll') return poll();
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
