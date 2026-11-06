/**
 * The jobs that are not a conversation: drain, reminders, digests, alerts,
 * distillation.
 *
 * These stay deterministic on purpose. A reminder that a model decided to send
 * is a reminder that can be forgotten; a receipt written by code is a receipt
 * that cannot be written twice.
 */

import { MODEL, TRANSCRIBE_MODELS } from './config.mjs';
import { githubTarget } from './config.mjs';
import { answerMessage } from './answer.mjs';
import { askModel, db, github } from './http.mjs';
import { failureId, failureLine } from './prompt.mjs';
import { sendMarkdown } from './progress.mjs';
import { claimRow, formatHistory, recordOutbound } from './store.mjs';
import { parseMemory } from './text.mjs';

const MAX_ATTEMPTS = 3;

/** A 4xx will fail the same way next time; a 5xx or a timeout may not. */
export function isPermanent(error) {
  if (error?.permanent === true) return true;
  return /failed: 4\d\d|not found|forbidden|unauthorized/i.test(String(error?.message ?? ''));
}

function log(line) {
  process.stdout.write(`telegram: ${line}\n`);
}

/**
 * Handles what the webhook stored.
 *
 * One message at a time, because one message is now an agent run. The claim is
 * what keeps two overlapping runs from both answering - and, more importantly,
 * from both opening a pull request for the same sentence.
 */
export async function drain() {
  await catchUpDigests().catch((error) => log(`digest catch-up skipped: ${error.message}`));

  const rows =
    (await db(
      'telegram_messages?direction=eq.in&processed_at=is.null&select=id,chat_id,body,voice_file_id,photo_file_id,document_file_id,attempts&order=id.asc&limit=5'
    )) ?? [];

  log(`${rows.length} unprocessed message(s)`);
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  for (const row of rows) {
    if (!(await claimRow(row))) continue;
    try {
      await answerMessage({ row, botToken });
    } catch (error) {
      await handleFailure(row, error);
    }
  }
}

/**
 * One apology per message, not one every five minutes.
 *
 * A row is released for another attempt only while the error might pass; a 4xx,
 * a missing file and a refusal are final on the first attempt, because retrying
 * them is how a deterministic bug becomes three identical messages and three
 * identical side effects.
 */
export async function handleFailure(row, error) {
  const attempts = Number(row.attempts ?? 0) + 1;
  const final = isPermanent(error) || attempts >= MAX_ATTEMPTS;
  const reference = failureId(`${row.id}:${attempts}:${error?.message ?? ''}`);

  await db(`telegram_messages?id=eq.${row.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ attempts, processed_at: final ? new Date().toISOString() : null }),
  }).catch(() => {});

  log(
    `message ${row.id} failed (attempt ${attempts}, ${final ? 'final' : 'retry'}): ${String(error?.message).slice(0, 300)}`
  );

  if (!final) return;

  // The owner gets a sentence and a reference. The provider's own words stay in
  // the run log, where they cannot leak a row's contents into a phone.
  const line = failureLine(reference);
  await sendMarkdown(row.chat_id, line).catch(() => {});
  await recordOutbound({ chatId: row.chat_id, body: line }).catch(() => {});
}

// ------------------------------------------------------------------- reminders

export async function remind() {
  const due = encodeURIComponent(new Date().toISOString());
  const rows =
    (await db(
      `telegram_reminders?sent_at=is.null&due_at=lte.${due}&select=id,chat_id,body&order=due_at.asc&limit=20`
    )) ?? [];

  for (const row of rows) {
    // Stored as the owner will read it, so the log and the phone agree.
    const text = `⏰ **تذكير**\n\n${row.body}`;
    await sendMarkdown(row.chat_id, text);
    await recordOutbound({ chatId: row.chat_id, body: text }).catch(() => {});
    // Only after the send succeeded: a failure stays pending and is retried on
    // the next run instead of disappearing.
    await db(`telegram_reminders?id=eq.${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ sent_at: new Date().toISOString() }),
    });
  }
}

// ------------------------------------------------------------------- digests

const conclusionArabic = {
  success: 'ناجح',
  failure: 'فاشل',
  cancelled: 'ملغى',
  skipped: 'متجاوز',
};

/**
 * An open pull request is news only once it has stopped moving.
 *
 * An implementer run that opens and merges inside four minutes made one change,
 * not two, so a pull still in its first half hour is not reported - it is being
 * worked on. Past that it is stuck on CI, a review or a conflict, which is the
 * thing worth a line.
 */
const OPEN_GRACE_MS = 30 * 60 * 1000;

const pullStateArabic = { open: 'مفتوح', closed: 'مغلق' };

export function pullState(pull, now = Date.now()) {
  if (pull?.merged_at) return 'merged';
  if (pull?.state === 'closed') return 'closed';
  if (!pull?.created_at) return null;
  return now - Date.parse(pull.created_at) >= OPEN_GRACE_MS ? 'open' : null;
}

export function unseen(items, seen) {
  return items.filter((item) => !seen.has(`${item.kind}:${item.number}:${item.state}`));
}

/** The heading and the lines the owner has not read. Nothing else. */
export function formatDigest({ workflow, items }) {
  const noun = workflow.includes('Planner') ? 'مهام جديدة' : 'تغييرات مدموجة';
  const lines = [`🗓 **${workflow}**`, '', `**${noun}:** ${items.length}`];
  for (const item of items) {
    const label = pullStateArabic[item.state] ? ` — ${pullStateArabic[item.state]}` : '';
    lines.push(`• [#${item.number}](${item.html_url}) ${item.title}${label}`);
  }
  return lines.join('\n');
}

export function formatAlert({ workflow, conclusion, url, repo }) {
  const label = conclusionArabic[conclusion] ?? conclusion ?? 'غير معروف';
  return [
    `⚠️ **${workflow}** — ${label}`,
    `المستودع: \`${repo}\``,
    url ? `[فتح التشغيل](${url})` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * The planner's news is an issue that exists and was not reported before.
 *
 * `since` on the issues endpoint filters by *updated* time, so a comment on an
 * old issue counted it as new - the first digest reported 16 where the planner
 * files at most five. Nothing is filtered by date here at all: the receipt, not
 * a window, is what decides whether the owner has seen a line.
 */
async function plannerItems({ owner, repo }) {
  const issues =
    (await github(
      `/repos/${owner}/${repo}/issues?state=all&sort=created&direction=desc&per_page=50`
    )) ?? [];
  return issues
    .filter((issue) => !issue.pull_request)
    .map((issue) => ({
      kind: 'issue',
      number: issue.number,
      state: 'created',
      title: issue.title,
      html_url: issue.html_url,
    }));
}

async function implementerItems({ owner, repo, now }) {
  // `state=all` and not `state=closed`: a pull that stays open is the one worth
  // telling the owner about, and it is `pullState` that decides when.
  const pulls =
    (await github(
      `/repos/${owner}/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=50`
    )) ?? [];
  return pulls
    .map((pull) => ({ pull, state: pullState(pull, now) }))
    .filter(({ state }) => Boolean(state))
    .map(({ pull, state }) => ({
      kind: 'pull',
      number: pull.number,
      state,
      title: pull.title,
      html_url: pull.html_url,
    }));
}

async function recordDigestItems(items) {
  if (!items.length) return;
  await db('telegram_digest_items', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(
      items.map((item) => ({
        kind: item.kind,
        number: item.number,
        state: item.state,
        sent_at: new Date().toISOString(),
      }))
    ),
  });
}

async function reportedKeys(items) {
  const seen = new Set();
  for (const kind of ['issue', 'pull']) {
    const numbers = items.filter((item) => item.kind === kind).map((item) => item.number);
    if (!numbers.length) continue;
    const rows =
      (await db(
        `telegram_digest_items?kind=eq.${kind}&number=in.(${numbers.join(',')})&select=number,state`
      )) ?? [];
    for (const row of rows) seen.add(`${kind}:${row.number}:${row.state}`);
  }
  return seen;
}

/**
 * Treat what is already on the repository as reported.
 *
 * Without this the change that replaced the 24-hour window would replay the
 * whole window once - seventeen lines the owner has already read. The flag is a
 * `telegram_state` row rather than "the receipts table is empty", because a
 * quiet repository has no receipts to notice, and reading emptiness as "never
 * seeded" would swallow the first item that ever arrived.
 */
export async function seedDigestItems({ now = Date.now() } = {}) {
  const flag = await db('telegram_state?key=eq.digest_items_seeded&select=value');
  if (flag?.[0]) return { seeded: false, items: 0 };

  const { owner, repo } = githubTarget();
  const items = [
    ...(await plannerItems({ owner, repo })),
    ...(await implementerItems({ owner, repo, now })),
  ];
  await recordDigestItems(items);
  await db('telegram_state', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      key: 'digest_items_seeded',
      value: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    }),
  });
  log(`digests: seeded ${items.length} item(s) as already reported`);
  return { seeded: true, items: items.length };
}

export async function digest({ workflow, url, runId }) {
  const { owner, repo } = githubTarget();
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!chat) throw new Error('TELEGRAM_CHAT_ID is not set');

  await seedDigestItems();

  const now = Date.now();
  const items = workflow.includes('Planner')
    ? await plannerItems({ owner, repo })
    : await implementerItems({ owner, repo, now });

  const fresh = unseen(items, await reportedKeys(items));

  if (fresh.length) {
    const text = formatDigest({ workflow, items: fresh });
    await sendMarkdown(chat, text);
    await recordOutbound({ chatId: chat, body: text, repo, runUrl: url ?? null });
    // The receipt is written after the message lands: a failed send must not
    // consume the lines, or the next tick would have nothing to retry.
    await recordDigestItems(fresh);
    log(`${workflow}: ${fresh.length} new item(s)`);
  } else {
    log(`${workflow}: nothing new`);
  }

  // A run receipt even when nothing was new, or catch-up re-reads the same run
  // every half hour for six hours.
  if (runId) {
    await db('telegram_digests', {
      method: 'POST',
      headers: { prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({ run_id: runId, workflow }),
    }).catch(() => {});
  }

  return { sent: fresh.length > 0, items: fresh.length };
}

export async function catchUpDigests() {
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

/**
 * A red check, once.
 *
 * Migration Drift failed three times in eleven minutes and the owner read the
 * same sentence three times. A repeat inside the window is the workflow saying
 * "still red", which the chat already knows.
 */
export async function alerts({ workflow, conclusion, url, windowMinutes = 30 }) {
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!chat) throw new Error('TELEGRAM_CHAT_ID is not set');
  if (conclusion === 'success' || conclusion === 'skipped') return { sent: false, reason: 'green' };

  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const recent =
    (await db(
      `telegram_messages?chat_id=eq.${chat}&direction=eq.out&created_at=gte.${encodeURIComponent(
        since
      )}&select=body&order=id.desc&limit=20`
    )) ?? [];

  // Only alerts count, not a digest that happens to name the same workflow.
  const repeated = recent.some(
    (row) => String(row.body ?? '').startsWith('⚠️') && String(row.body).includes(workflow)
  );
  if (repeated) return { sent: false, reason: 'duplicate' };

  const { owner, repo } = githubTarget();
  const text = formatAlert({ workflow, conclusion, url, repo: `${owner}/${repo}` });
  await sendMarkdown(chat, text);
  await recordOutbound({ chatId: chat, body: text, repo });
  return { sent: true };
}

// --------------------------------------------------------------- distillation

export const REMEMBER_PROMPT = [
  'اقرأ هذه المحادثة بين أيهم والمساعد، وأعد كائن JSON فقط بلا أي نص آخر، بالشكل:',
  '{"summary": "...", "memories": [{"kind": "preference|fact|project", "content": "..."}]}',
  'الملخّص: فقرة قصيرة تصف ما جرى وما يهم في المحادثة، بالعربية الفصحى.',
  'الذاكرة: حقائق دائمة فقط تستحق التذكّر لاحقاً — تفضيلات أيهم، طريقة عمله، قرارات اتخذها، تفاصيل عن مشروعه أو وقته.',
  'كل ذكرى جملة واحدة قصيرة ≤ 200 حرف. لا تخترع شيئاً لم يُقل، ولا تسجّل شكاً على أنه حقيقة.',
  'إن لم يوجد ما يستحق التذكّر فأعد {"summary": "...", "memories": []}.',
].join('\n');

export async function remember() {
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!chat) return;

  const cursorRows = await db('telegram_state?key=eq.memory_cursor&select=value');
  const cursor = Number(cursorRows?.[0]?.value ?? 0);

  // The window is read once, with the ids the cursor needs. Runs are serialised
  // by the workflow's concurrency group, so no lock is needed here.
  const window =
    (await db(
      `telegram_messages?chat_id=eq.${chat}&id=gt.${cursor}&select=id,direction,body&order=id.asc&limit=100`
    )) ?? [];

  // Six is where a distillation starts to beat reading the messages themselves.
  if (window.length < 6) {
    log(`remember: ${window.length} new message(s), below the six it needs`);
    return;
  }

  const message = await askModel(
    [
      { role: 'system', content: REMEMBER_PROMPT },
      { role: 'user', content: formatHistory(window) },
    ],
    { model: MODEL }
  ).catch((error) => {
    // Distillation is a background nicety: a failure here must not turn a
    // delivered answer into a red run. The cursor stays where it is, so the same
    // window is tried again next time.
    log(`remember skipped: ${String(error.message).slice(0, 200)}`);
    return null;
  });
  if (!message) return;

  const { summary, memories } = parseMemory(message.content);

  if (summary) {
    await db('telegram_summaries', {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        chat_id: chat,
        summary,
        covers_until: window[window.length - 1].id,
        updated_at: new Date().toISOString(),
      }),
    });
  }

  for (const row of memories) {
    await db('telegram_memories', {
      method: 'POST',
      headers: { prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({ chat_id: chat, kind: row.kind, content: row.content }),
    }).catch(() => {});
  }

  await db('telegram_state', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      key: 'memory_cursor',
      value: String(window[window.length - 1].id),
      updated_at: new Date().toISOString(),
    }),
  });

  log(`remember: ${memories.length} fact(s) from ${window.length} message(s)`);
}

// --------------------------------------------------------------------- probe

export async function probe() {
  const { openCodeKey } = await import('./config.mjs');
  const key = openCodeKey();
  if (!key) throw new Error('OPENCODE_API_KEY is not set');

  const data = silenceWav().toString('base64');

  for (const model of [...TRANSCRIBE_MODELS, MODEL]) {
    const response = await fetch('https://opencode.ai/inference/go/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        'user-agent': 'royaraqamia-telegram-bot/2.0',
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

    log(
      `probe ${model}: ${response.status} ${(await response.text().catch(() => '')).slice(0, 600)}`
    );
  }
}

/** A one-second silent WAV, so a probe measures the endpoint rather than the upload. */
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
