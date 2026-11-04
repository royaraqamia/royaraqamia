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

export function formatDigest({ workflow, runs, items, url }) {
  const noun = workflow.includes('Planner') ? 'مهام جديدة' : 'تغييرات مدموجة';
  const lines = [`🗓 **${workflow}** — آخر 24 ساعة`];

  if (!runs.length) {
    lines.push('لا تشغيلات مسجلة.');
  } else {
    const successes = runs.filter((run) => run.conclusion === 'success').length;
    const failures = runs.filter((run) => run.conclusion === 'failure').length;
    lines.push(`التشغيلات: ${successes} ناجح · ${failures} فاشل`);
    const latest = runs[0];
    const label = conclusionArabic[latest.conclusion] ?? latest.conclusion ?? 'غير معروف';
    lines.push(
      `آخر تشغيل: ${label}${latest.html_url ? ` — [عرض التشغيل](${latest.html_url})` : ''}`
    );
  }

  if (items.length) {
    lines.push('', `**${noun}:** ${items.length}`);
    for (const item of items.slice(0, 12)) {
      lines.push(`• [#${item.number}](${item.html_url}) ${item.title}`);
    }
    if (items.length > 12) lines.push(`… و${items.length - 12} أخرى`);
  } else {
    lines.push('', `${noun}: لا شيء.`);
  }

  if (url) lines.push('', `[سجل التشغيل الكامل](${url})`);
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

export async function digest({ workflow, url, runId }) {
  const { owner, repo } = githubTarget();
  const chat = process.env.TELEGRAM_CHAT_ID;
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
  await sendMarkdown(chat, text);
  await recordOutbound({ chatId: chat, body: text, repo, runUrl: url ?? null });

  // A receipt is written even for an on-demand digest: without one, the
  // catch-up below reports the same run again and the owner reads it twice.
  if (runId) {
    await db('telegram_digests', {
      method: 'POST',
      headers: { prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({ run_id: runId, workflow }),
    }).catch(() => {});
  }
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
