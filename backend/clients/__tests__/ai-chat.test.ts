import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AI_CHAT_DEFAULT_MODEL,
  chunkText,
  createAiChatClient,
  sseData,
} from '@/backend/clients/ai-chat';
import { env } from '@/backend/config/env';

/** A provider body that splits one frame across two chunks, as a socket does. */
function sse(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function frame(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}

describe('sseData', () => {
  it('reads a data line and ignores the provider’s keep-alives', () => {
    expect(sseData('data: {"a":1}')).toBe('{"a":1}');
    expect(sseData(': keep-alive')).toBeNull();
    expect(sseData('data:   ')).toBeNull();
  });
});

describe('chunkText', () => {
  it('answers the delta text, and null for a chunk that carries none', () => {
    expect(chunkText({ choices: [{ delta: { content: 'مرحبا' } }] })).toBe('مرحبا');
    expect(chunkText({ choices: [{ delta: {} }] })).toBeNull();
    expect(chunkText({ choices: [] })).toBeNull();
    expect(chunkText(null)).toBeNull();
  });
});

describe('the assistant provider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('is off when no key is configured', () => {
    vi.stubEnv('AI_CHAT_API_KEY', '');
    expect(createAiChatClient()).toBeNull();
  });

  it('uses the documented Gemini defaults when nothing else is set', async () => {
    vi.stubEnv('AI_CHAT_API_KEY', 'key');
    vi.stubEnv('AI_CHAT_BASE_URL', '');
    vi.stubEnv('AI_CHAT_MODEL', '');

    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return new Response(sse('[DONE]\n\n'), { status: 200 });
      })
    );

    const client = createAiChatClient();
    expect(client?.model).toBe(AI_CHAT_DEFAULT_MODEL);

    for await (const _ of client!.streamReply([], new AbortController().signal)) {
      // The body carries no text, so nothing is yielded.
    }

    expect(calls[0]?.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
    );
    expect((calls[0]?.body as { model: string }).model).toBe(AI_CHAT_DEFAULT_MODEL);
    expect(env.aiChatModel).toBe('');
  });

  it('switches vendor through the environment alone', async () => {
    vi.stubEnv('AI_CHAT_API_KEY', 'key');
    vi.stubEnv('AI_CHAT_BASE_URL', 'https://api.deepseek.com/v1/');
    vi.stubEnv('AI_CHAT_MODEL', 'deepseek-chat');

    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        return new Response(sse('[DONE]\n\n'), { status: 200 });
      })
    );

    const client = createAiChatClient();
    for await (const _ of client!.streamReply([], new AbortController().signal)) {
      // No text in the fixture.
    }

    expect(urls[0]).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(client?.model).toBe('deepseek-chat');
  });

  it('yields the deltas of a frame split across chunks, in order', async () => {
    vi.stubEnv('AI_CHAT_API_KEY', 'key');
    const body = frame('مرحبا ') + frame('بك');
    const cut = body.indexOf('"choices"') + 4;

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(sse(body.slice(0, cut), body.slice(cut), 'data: [DONE]\n\n'), {
            status: 200,
          })
      )
    );

    const received: string[] = [];
    for await (const delta of createAiChatClient()!.streamReply([], new AbortController().signal)) {
      received.push(delta);
    }

    expect(received).toEqual(['مرحبا ', 'بك']);
  });

  it('answers a provider refusal as a readable status, not a crash', async () => {
    vi.stubEnv('AI_CHAT_API_KEY', 'key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('quota exceeded', { status: 429 }))
    );

    const stream = createAiChatClient()!.streamReply([], new AbortController().signal);
    await expect(stream.next()).rejects.toMatchObject({ status: 429 });
  });
});
