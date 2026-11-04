import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { silenceWav } from '../telegram-bridge.mjs';
import { transcribe } from '../telegram/answer.mjs';
import { createReporter, sendMarkdown } from '../telegram/progress.mjs';
import { recordOutbound } from '../telegram/store.mjs';

/**
 * The seam that talks to Telegram, Supabase and the model.
 *
 * Two bugs reached the owner's phone while the pure tests stayed green: a voice
 * URL missing `/file` (every download 404) and a status message that was edited
 * faster than Telegram allows. Both live here, so `fetch` is the only thing to
 * stub and the assertions are about the request that was made.
 */

const TOKEN = 'test-token';
const calls = [];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fakeFetch({ audio = 'ok' } = {}) {
  return async (url, init = {}) => {
    const href = String(url);
    calls.push({ href, init, body: init.body ? JSON.parse(String(init.body)) : null });

    if (href.endsWith('/getFile'))
      return json({ ok: true, result: { file_path: 'voice/file_1.oga' } });

    if (href.includes('api.telegram.org/file/bot')) {
      if (audio === 'missing') return new Response('gone', { status: 404 });
      return new Response(silenceWav(), { status: 200 });
    }

    if (href.includes('/chat/completions')) {
      return json({ choices: [{ message: { role: 'assistant', content: 'اتصل بالبنك' } }] });
    }

    if (href.includes('/sendMessage')) return json({ ok: true, result: { message_id: 77 } });

    if (href.includes('/editMessageText')) return json({ ok: true, result: { message_id: 77 } });
    if (href.includes('/deleteMessage')) return json({ ok: true, result: true });

    if (href.includes('/rest/v1/telegram_messages')) return json([{ id: 1 }]);

    throw new Error(`unexpected fetch: ${href}`);
  };
}

beforeEach(() => {
  calls.length = 0;
  process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  process.env.TELEGRAM_CHAT_ID = '4242';
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  process.env.OPENCODE_API_KEY = 'gateway-key';
  vi.stubGlobal('fetch', fakeFetch());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('transcribe', () => {
  it('downloads through /file/bot, which is the path Telegram actually serves', async () => {
    const text = await transcribe('file-1', { botToken: TOKEN });
    expect(text).toBe('اتصل بالبنك');

    const download = calls.find((call) => call.href.includes('/file/bot'));
    expect(download?.href).toBe(`https://api.telegram.org/file/bot${TOKEN}/voice/file_1.oga`);

    const inference = calls.find((call) => call.href.includes('/chat/completions'));
    expect(JSON.stringify(inference?.body)).toContain('input_audio');
  });

  it('says the file is gone instead of retrying a 404 forever', async () => {
    vi.stubGlobal('fetch', fakeFetch({ audio: 'missing' }));
    await expect(transcribe('file-1', { botToken: TOKEN })).rejects.toThrow(/لم يعد Telegram/);
    await expect(transcribe('file-1', { botToken: TOKEN })).rejects.toMatchObject({
      permanent: true,
    });
  });
});

describe('recordOutbound', () => {
  it('refuses an empty body rather than writing a row the log cannot explain', async () => {
    await expect(recordOutbound({ chatId: 4242, body: '   ' })).rejects.toThrow(/empty body/);
    expect(calls.some((call) => call.href.includes('/telegram_messages'))).toBe(false);
  });

  it('writes the message the owner will read', async () => {
    await recordOutbound({ chatId: 4242, body: 'نص', telegramMessageId: 77 });
    const write = calls.find((call) => call.href.includes('/telegram_messages'));
    expect(write?.body).toMatchObject({ direction: 'out', body: 'نص', telegram_message_id: 77 });
  });
});

describe('the status message', () => {
  it('starts with a stop button and is deleted rather than left behind', async () => {
    const reporter = createReporter({ chatId: 4242, messageRowId: 9 });
    await reporter.start('أقرأ رسالتك…');
    await reporter.close();

    const sent = calls.find((call) => call.href.includes('/sendMessage'));
    expect(sent?.body.reply_markup.inline_keyboard[0][0].callback_data).toBe('stop:9');

    const deleted = calls.find((call) => call.href.includes('/deleteMessage'));
    expect(deleted?.body.message_id).toBe(77);
  });

  it('does not edit more often than Telegram allows', async () => {
    const reporter = createReporter({ chatId: 4242, messageRowId: 9 });
    await reporter.start('أقرأ رسالتك…');
    await reporter.update('أقرأ الملف…');
    await reporter.update('أبحث في المستودع…');

    const edits = calls.filter((call) => call.href.includes('/editMessageText'));
    expect(edits).toHaveLength(0);
    await reporter.close();
  });
});

describe('sendMarkdown', () => {
  it('renders HTML and never sends more than one piece unmarked', async () => {
    const sent = await sendMarkdown(4242, '**جواب** قصير');
    expect(sent[0].messageId).toBe(77);
    const message = calls.find((call) => call.href.includes('/sendMessage'));
    expect(message?.body.text).toContain('<b>جواب</b>');
    expect(message?.body.parse_mode).toBe('HTML');
  });

  it('attaches the keyboard to the last piece only', async () => {
    const long = Array.from({ length: 400 }, (_, index) => `سطر ${index} نص`).join('\n');
    await sendMarkdown(4242, long, {
      replyMarkup: { inline_keyboard: [[{ text: 'x', callback_data: 'y' }]] },
    });

    const sends = calls.filter((call) => call.href.includes('/sendMessage'));
    expect(sends.length).toBeGreaterThan(1);
    expect(sends[sends.length - 1].body.reply_markup).toBeTruthy();
    expect(sends[0].body.reply_markup).toBeUndefined();
  });
});
