import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleAnswer, silenceWav, transcribe } from '../telegram-bridge.mjs';

/**
 * These tests exist because the seam they cover is where two bugs reached the
 * owner's phone while 41 unit tests stayed green: a voice URL missing `/file`
 * (every download 404) and a renamed variable left behind in the answer route
 * (`history is not defined`, every reply failed). Both live in code that talks to
 * Telegram and the model, so `fetch` is the only thing to stub and the assertions
 * have to be about the request that was made and the reply that was sent.
 */

const TOKEN = 'test-token';
const CHAT = 4242;

const calls = [];

/** A fake Telegram, Supabase and inference gateway, routed by URL. */
function fakeFetch({ answer = 'إجابة', transcript = 'نص الصوت' } = {}) {
  return async (url, init = {}) => {
    const href = String(url);
    calls.push({ href, init });

    if (href.includes('/rest/v1/telegram_messages') && (init.method ?? 'GET') === 'GET')
      return json([]);
    if (href.includes('/rest/v1/telegram_memories')) return json([]);
    if (href.includes('/rest/v1/telegram_summaries')) return json([]);
    if (href.includes('/rest/v1/telegram_messages')) return json([]);

    if (href.endsWith('/getFile'))
      return json({ ok: true, result: { file_path: 'voice/file_1.oga' } });
    if (href.includes('api.telegram.org/file/bot'))
      return new Response(silenceWav(), { status: 200 });
    if (href.includes('/sendMessage')) return json({ ok: true, result: { message_id: 1 } });

    if (href.includes('/chat/completions')) {
      const body = JSON.parse(init.body ?? '{}');
      const hasAudio = JSON.stringify(body.messages ?? []).includes('input_audio');
      return json({
        choices: [{ message: { role: 'assistant', content: hasAudio ? transcript : answer } }],
      });
    }

    throw new Error(`unexpected fetch: ${href}`);
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const sentText = () =>
  calls
    .filter((call) => call.href.includes('/sendMessage'))
    .map((call) => JSON.parse(call.init.body).text);

beforeEach(() => {
  calls.length = 0;
  process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  process.env.TELEGRAM_CHAT_ID = String(CHAT);
  process.env.OPENCODE_API_KEY = 'test-key';
  process.env.SUPABASE_URL = 'https://project.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  vi.stubGlobal('fetch', fakeFetch());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('transcribe', () => {
  it('downloads from /file/bot<token>/<path>, which is the only URL Telegram serves', async () => {
    const text = await transcribe('file-id');

    expect(text).toBe('نص الصوت');
    const download = calls.find((call) => call.href.includes('api.telegram.org/file/bot'));
    expect(download?.href).toBe(`https://api.telegram.org/file/bot${TOKEN}/voice/file_1.oga`);
  });

  it('sends the audio it downloaded, not an empty payload', async () => {
    await transcribe('file-id');

    const inference = calls.find((call) => call.href.includes('/chat/completions'));
    const body = JSON.parse(inference.init.body);
    const audio = body.messages[0].content.find((part) => part.type === 'input_audio');
    expect(audio.input_audio.data.length).toBeGreaterThan(100);
  });

  it('treats a 404 as permanent, so the row is answered once instead of retried', async () => {
    vi.stubGlobal('fetch', async (url, init = {}) => {
      const href = String(url);
      if (href.endsWith('/getFile'))
        return json({ ok: true, result: { file_path: 'voice/file_1.oga' } });
      if (href.includes('api.telegram.org/file/bot')) return new Response('gone', { status: 404 });
      return fakeFetch()(url, init);
    });

    await expect(transcribe('file-id')).rejects.toMatchObject({ permanent: true });
  });
});

describe('handleAnswer', () => {
  it('sends the model answer back to the chat', async () => {
    await handleAnswer({ text: 'كيف حالك؟', chat: CHAT, messageId: 10 });

    expect(sentText()).toContain('إجابة');
  });

  it('escapes and renders the answer, so a code span is not a literal backtick', async () => {
    vi.stubGlobal('fetch', fakeFetch({ answer: 'استخدم `/task` <b>' }));

    await handleAnswer({ text: 'سؤال', chat: CHAT, messageId: 11 });

    expect(sentText()[0]).toBe('استخدم <code>\u200E/task</code> &lt;b&gt;');
  });

  it('queues an escalation instead of answering when the model asks for evidence', async () => {
    vi.stubGlobal('fetch', async (url, init = {}) => {
      const href = String(url);
      calls.push({ href, init });
      if (href.includes('/chat/completions')) {
        return json({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    function: {
                      name: 'lookup',
                      arguments: '{"source":"repo","query":"check:plan"}',
                    },
                  },
                ],
              },
            },
          ],
        });
      }
      if (href.includes('/rest/v1/telegram_lookups')) return json([]);
      if (href.includes('/rest/v1/telegram_messages')) return json([]);
      if (href.includes('/rest/v1/telegram_memories')) return json([]);
      if (href.includes('/rest/v1/telegram_summaries')) return json([]);
      if (href.includes('/sendMessage')) return json({ ok: true, result: {} });
      throw new Error(`unexpected fetch: ${href}`);
    });

    await handleAnswer({ text: 'لماذا يفشل check:plan؟', chat: CHAT, messageId: 12 });

    const seen = calls.map((call) => `${call.init.method ?? 'GET'} ${call.href}`);
    expect(seen.join('\n')).toContain('/telegram_lookups');
    const queued = calls.find(
      (call) => call.href.includes('/telegram_lookups') && call.init.method === 'POST'
    );
    expect(JSON.parse(queued.init.body)).toMatchObject({ source: 'repo', query: 'check:plan' });
    expect(sentText()[0]).toContain('سأقرأ في المستودع');
  });
});
