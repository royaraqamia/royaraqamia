/**
 * The database, as the bot uses it.
 *
 * The message log is the bot's memory and its audit trail at once, so a row is
 * written for everything the owner sees. That is why an outbound insert refuses
 * an empty body instead of sending a message the log does not know about: the
 * not-null violation it used to raise reached the chat as
 * "…null value in column \"body\" of relation \"telegram_messages\"…".
 */

import { db } from './http.mjs';
import { stripHtml } from './text.mjs';

export async function ensureChat(chatId, title) {
  await db('telegram_chats', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      chat_id: chatId,
      title: title ?? null,
      last_seen_at: new Date().toISOString(),
    }),
  });

  const rows = await db(`telegram_chats?chat_id=eq.${chatId}&select=tz_offset_minutes,tz_name`);
  return rows?.[0] ?? { tz_offset_minutes: null, tz_name: null };
}

/**
 * The compare-and-set that makes a message belong to exactly one run.
 *
 * The webhook dispatches a run per message, so two runs can be awake at once;
 * `processed_at is null` in the filter is what stops both of them from
 * answering, filing an issue and opening a pull request.
 */
export async function claimRow(row) {
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

export async function patchMessage(id, patch) {
  await db(`telegram_messages?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/**
 * Records a message the owner will see. The body is required, and a caller that
 * has nothing to say is a bug rather than an empty row.
 */
export async function recordOutbound({
  chatId,
  body,
  repo = null,
  runUrl = null,
  telegramMessageId = null,
}) {
  const text = String(body ?? '').trim();
  if (!text) throw new Error('refusing to record an outbound message with an empty body');

  await db('telegram_messages', {
    method: 'POST',
    body: JSON.stringify({
      chat_id: chatId,
      direction: 'out',
      body: text,
      repo,
      run_url: runUrl,
      telegram_message_id: telegramMessageId,
    }),
  });
}

/**
 * The last few exchanges, as the agent's short-term memory.
 *
 * Stored bodies are Telegram HTML (`<a href>`, `<code>`, `&quot;`). Passing that
 * straight to a model teaches it to answer in HTML fragments and to quote
 * `&quot;` at the owner, so the markup is stripped here, once.
 */
export async function recentHistory(chatId, beforeId, limit = 12) {
  const filter = beforeId ? `&id=lt.${beforeId}` : '';
  const rows =
    (await db(
      `telegram_messages?chat_id=eq.${chatId}${filter}&select=direction,body,created_at&order=id.desc&limit=${limit}`
    )) ?? [];

  return rows
    .reverse()
    .filter((row) => row?.body)
    .map((row) => ({ ...row, body: stripHtml(row.body) }));
}

export async function memoriesFor(chatId) {
  return (
    (await db(
      `telegram_memories?chat_id=eq.${chatId}&select=id,kind,content&order=id.desc&limit=60`
    )) ?? []
  );
}

export async function summaryFor(chatId) {
  const rows = await db(`telegram_summaries?chat_id=eq.${chatId}&select=summary`);
  return rows?.[0]?.summary ?? '';
}

export async function forgetMemory(chatId, id) {
  const rows = await db(`telegram_memories?id=eq.${id}&chat_id=eq.${chatId}`, {
    method: 'DELETE',
    headers: { prefer: 'return=representation' },
  });
  return Boolean(rows?.length);
}

/** What the agent knows before it reads the message: memory, summary, and the last exchanges. */
export async function contextFor(chatId, messageId) {
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

export function formatHistory(rows) {
  return rows
    .filter((row) => row?.body)
    .map((row) => `${row.direction === 'in' ? 'أيهم' : 'المساعد'}: ${row.body}`)
    .join('\n');
}

export function formatMemories(rows, limit = 40) {
  const seen = new Set();
  const lines = [];
  for (const row of rows) {
    const content = String(row?.content ?? '').trim();
    if (!content || seen.has(content)) continue;
    seen.add(content);
    lines.push(`• [${row.id}] ${content}`);
    if (lines.length >= limit) break;
  }
  return lines.join('\n');
}

export function formatContext({ summary, memories, history }) {
  return [
    memories ? `ما تتذكره عن أيهم:\n${memories}` : '',
    summary ? `ملخّص المحادثات السابقة:\n${summary}` : '',
    history ? `آخر الرسائل:\n${history}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

// ---------------------------------------------------------------- confirmations

/**
 * A confirmation is a row, not a conversation memory.
 *
 * Two taps have to survive between two workflow runs, and a `message_id` in a
 * prompt is a hope rather than a guarantee. The row carries the step, the PR it
 * refers to, and when it stops being valid - so a button tapped by accident
 * forty minutes later does nothing at all.
 */
export async function openConfirmation({ chatId, messageId, kind, target, ttlMinutes = 30 }) {
  const rows = await db('telegram_confirmations', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId ?? null,
      kind,
      target: String(target),
      step: 1,
      expires_at: new Date(Date.now() + ttlMinutes * 60_000).toISOString(),
    }),
  });
  return rows?.[0] ?? null;
}

export async function findConfirmation(id) {
  const rows = await db(
    `telegram_confirmations?id=eq.${id}&completed_at=is.null&select=id,chat_id,message_id,kind,target,step,expires_at`
  );
  const row = rows?.[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return { ...row, expired: true };
  return row;
}

export async function advanceConfirmation(id, step) {
  await db(`telegram_confirmations?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ step }),
  });
}

export async function completeConfirmation(id, outcome) {
  await db(`telegram_confirmations?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ completed_at: new Date().toISOString(), outcome }),
  });
}

export async function noteCallback({ chatId, messageId, data, payload }) {
  await db('telegram_callbacks', {
    method: 'POST',
    headers: { prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({
      callback_id: payload?.id ?? null,
      chat_id: chatId,
      message_id: messageId,
      data,
    }),
  }).catch(() => {});
}
