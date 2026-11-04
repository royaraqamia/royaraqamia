/**
 * The "typing" the owner sees, and the only place that talks to Telegram about
 * a message that is still being written.
 *
 * Why a status message and not silence: an agent turn can take minutes, and five
 * minutes of nothing looks exactly like a dead bot. Why it is deleted at the end
 * rather than edited into the answer: the answer is chunked, its last piece may
 * carry buttons, and a status message with a stale stop button under a finished
 * answer invites a tap that can only fail.
 */

import { MAX_STATUS } from './config.mjs';
import { telegram } from './http.mjs';
import { chunkMarkdown, renderAnswer, withPartNumbers } from './text.mjs';

/** One edit every few seconds: Telegram allows about 20 a minute per chat. */
const EDIT_INTERVAL_MS = 3_000;

export function stopKeyboard(messageRowId) {
  if (!messageRowId) return undefined;
  return {
    inline_keyboard: [[{ text: 'إيقاف', callback_data: `stop:${messageRowId}` }]],
  };
}

export async function sendMarkdown(chatId, markdown, { replyMarkup } = {}) {
  const chunks = withPartNumbers(chunkMarkdown(markdown));
  const sent = [];

  for (const [index, chunk] of chunks.entries()) {
    const html = renderAnswer(chunk);
    if (!html) continue;
    const last = index === chunks.length - 1;
    const result = await telegram('sendMessage', {
      chat_id: chatId,
      text: html,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(last && replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
    sent.push({ html, messageId: result?.message_id ?? null });
  }

  return sent;
}

/**
 * A status message with a lifetime.
 *
 * `update` is called from the agent's event stream, which can fire dozens of
 * times a second; the throttle is here so the event stream never has to care.
 */
export function createReporter({ chatId, messageRowId, onLog = () => {} }) {
  let statusId = null;
  let lastText = '';
  let lastEdit = 0;
  let closed = false;

  const clamp = (text) => String(text ?? '').slice(0, MAX_STATUS);

  return {
    async start(text) {
      const body = clamp(text);
      try {
        const result = await telegram('sendMessage', {
          chat_id: chatId,
          text: renderAnswer(body),
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
          ...(messageRowId ? { reply_markup: stopKeyboard(messageRowId) } : {}),
        });
        statusId = result?.message_id ?? null;
        lastText = body;
        lastEdit = Date.now();
      } catch (error) {
        onLog(`status message failed: ${error.message}`);
      }
    },

    async update(text) {
      const body = clamp(text);
      if (closed || !statusId || body === lastText) return;
      if (Date.now() - lastEdit < EDIT_INTERVAL_MS) return;

      try {
        await telegram('editMessageText', {
          chat_id: chatId,
          message_id: statusId,
          text: renderAnswer(body),
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
          ...(messageRowId ? { reply_markup: stopKeyboard(messageRowId) } : {}),
        });
        lastText = body;
        lastEdit = Date.now();
      } catch (error) {
        // "message is not modified" and a deleted status message are both
        // noise: the answer still goes out below.
        onLog(`status edit skipped: ${error.message}`);
      }
    },

    async close() {
      if (closed) return;
      closed = true;
      if (!statusId) return;
      await telegram('deleteMessage', { chat_id: chatId, message_id: statusId }).catch((error) =>
        onLog(`status delete skipped: ${error.message}`)
      );
      statusId = null;
    },
  };
}
