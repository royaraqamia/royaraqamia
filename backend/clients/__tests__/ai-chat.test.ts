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
    vi.stubEnv('OPENCODE_API_KEY', '');
    expect(createAiChatClient()).toBeNull();
  });

  it('reads the pipeline key when the dedicated one is absent', () => {
    vi.stubEnv('AI_CHAT_API_KEY', '');
    vi.stubEnv('OPENCODE_API_KEY', 'key');
    expect(createAiChatClient()).not.toBeNull();
  });

  it('uses the documented gateway defaults when nothing else is set', async () => {
    vi.stubEnv('AI_CHAT_API_KEY', 'key');
    vi.stubEnv('AI_CHAT_BASE_URL', '');
    vi.stubEnv('AI_CHAT_MODEL', '');

    const calls: { url: string; body: unknown; headers: Record<string, string> }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({
          url,
          body: JSON.parse(String(init.body)),
          headers: init.headers as Record<string, string>,
        });
        return new Response(sse('[DONE]\n\n'), { status: 200 });
      })
    );

    const client = createAiChatClient();
    expect(client?.model).toBe(AI_CHAT_DEFAULT_MODEL);

    for await (const _ of client!.streamReply([], new AbortController().signal)) {
      // The body carries no text, so nothing is yielded.
    }

    expect(calls[0]?.url).toBe('https://opencode.ai/inference/go/openai/v1/chat/completions');
    expect((calls[0]?.body as { model: string }).model).toBe(AI_CHAT_DEFAULT_MODEL);
    // Without a session name the gateway answers 400 MissingSessionID, so the
    // header is part of the contract rather than a nicety.
    expect(calls[0]?.headers['x-opencode-session']).toBe('assistant');
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

  /**
   * A turn's user message is words or parts (ADR-0127, ADR-0139): an image rides
   * as an `image_url` data URL inside the request body, and the client must send
   * it as the array it was given rather than flattening it to text.
   */
  it('sends a turn’s parts — text and images — in the request body', async () => {
    vi.stubEnv('AI_CHAT_API_KEY', 'key');
    const calls: { messages: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push(JSON.parse(String(init.body)) as { messages: unknown });
        return new Response(sse('[DONE]\n\n'), { status: 200 });
      })
    );

    const parts = [
      { type: 'text' as const, text: 'ما في هذه الصورة؟' },
      { type: 'image_url' as const, image_url: { url: 'data:image/webp;base64,AQID' } },
    ];
    for await (const _ of createAiChatClient()!.streamWithTools(
      [{ role: 'user', content: parts }],
      [],
      new AbortController().signal
    )) {
      // No text in the fixture.
    }

    expect(calls[0]?.messages).toEqual([{ role: 'user', content: parts }]);
  });
});
