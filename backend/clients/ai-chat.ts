import { env } from '@/backend/config/env';
import { logger } from '@/backend/shared/logger';

/**
 * The assistant's provider, spoken to over the OpenAI-compatible chat
 * completions API (ADR-0113, #817).
 *
 * The vendor is three environment variables and no code: `AI_CHAT_BASE_URL`,
 * `AI_CHAT_MODEL` and `AI_CHAT_API_KEY`. Gemini's compatibility endpoint and a
 * Flash model are the defaults, because its free tier needs no card; DeepSeek's
 * own base URL is the documented escape hatch. Nothing here knows which vendor
 * answered, which is the point.
 *
 * The reply is streamed (`stream: true`) and yielded as text deltas, so the
 * route can answer SSE and the member reads the answer as it is written. A turn
 * is capped below the platform's function ceiling by the caller's `AbortSignal`.
 */

export const AI_CHAT_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
export const AI_CHAT_DEFAULT_MODEL = 'gemini-3.8-flash';

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * The provider's own refusal: an exhausted free tier (429) or a billing wall
 * (402). It is a state the thread shows, not an outage, so it carries the
 * status that made it readable.
 */
export class AiChatProviderError extends Error {
  constructor(
    readonly status: number,
    message = 'the assistant provider refused the request'
  ) {
    super(message);
    this.name = 'AiChatProviderError';
  }
}

export interface AiChatClient {
  readonly model: string;
  streamReply(messages: AiChatMessage[], signal: AbortSignal): AsyncGenerator<string, void, void>;
}

/** Whether a provider key is configured at all. No key means the assistant is off. */
export function aiChatConfigured(): boolean {
  return Boolean(env.aiChatApiKey);
}

/**
 * One line of an SSE body, or `null` for the keep-alives and the comments a
 * provider is free to send. Exported because the framing is the part worth
 * pinning in a test: a provider that answers `data: [DONE]` or splits a JSON
 * object across two chunks must not be read as an empty answer.
 */
export function sseData(line: string): string | null {
  if (!line.startsWith('data:')) return null;
  const data = line.slice('data:'.length).trim();
  return data === '' ? null : data;
}

/** The text a `chat.completion.chunk` carries, or `null` when it carries none. */
export function chunkText(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;

  const delta = (choices[0] as { delta?: unknown }).delta;
  if (typeof delta !== 'object' || delta === null) return null;

  const content = (delta as { content?: unknown }).content;
  return typeof content === 'string' && content.length > 0 ? content : null;
}

async function* readDeltas(body: ReadableStream<Uint8Array>): AsyncGenerator<string, void, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // A chunk boundary can split a line, so only complete lines are read and
      // the remainder waits for the next chunk.
      for (;;) {
        const newline = buffer.indexOf('\n');
        if (newline === -1) break;
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);

        const data = sseData(line);
        if (data === null || data === '[DONE]') continue;

        let payload: unknown;
        try {
          payload = JSON.parse(data);
        } catch {
          logger.warn('Unreadable assistant stream frame');
          continue;
        }

        const text = chunkText(payload);
        if (text) yield text;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/**
 * The configured client, or `null` when no key is set. `null` is a supported
 * state: the thread reads, and the composer says the assistant is unavailable
 * rather than sending a request that is certain to fail.
 */
export function createAiChatClient(): AiChatClient | null {
  const apiKey = env.aiChatApiKey;
  if (!apiKey) return null;

  const baseUrl = (env.aiChatBaseUrl?.trim() || AI_CHAT_DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = env.aiChatModel?.trim() || AI_CHAT_DEFAULT_MODEL;

  return {
    model,
    async *streamReply(messages, signal) {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, messages, stream: true }),
        signal,
        cache: 'no-store',
      });

      if (!response.ok) {
        // The body names the provider's reason; it is logged, never sent to the
        // member, because it talks about quotas and keys rather than the app.
        const detail = await response.text().catch(() => '');
        logger.warn('Assistant provider refused a turn', {
          status: response.status,
          detail: detail.slice(0, 500),
        });
        throw new AiChatProviderError(response.status);
      }

      if (!response.body) throw new AiChatProviderError(502);

      yield* readDeltas(response.body);
    },
  };
}
