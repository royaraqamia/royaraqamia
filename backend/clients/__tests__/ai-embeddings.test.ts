import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAiEmbeddingsClient,
  embeddingDimensionMismatch,
  readEmbeddings,
  resetEmbeddingWarnings,
} from '@/backend/clients/ai-embeddings';
import { EMBEDDING_GENERATION } from '@/backend/shared/domain/agent-memory';

/** A vector of the generation's width, so a shape test is about shape. */
const vector = (fill = 0.25) => Array.from({ length: EMBEDDING_GENERATION.dimensions }, () => fill);

/** The provider's answer, `index`-numbered the way the API documents it. */
function answer(embeddings: number[][]) {
  return { data: embeddings.map((embedding, index) => ({ index, embedding })) };
}

function stubProvider(
  handler: (body: { input: string[]; model: string }) => Response | Promise<Response>
) {
  const calls: {
    url: string;
    body: { input: string[]; model: string };
    headers: Record<string, string>;
  }[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { input: string[]; model: string };
      calls.push({ url, body, headers: init.headers as Record<string, string> });
      return handler(body);
    })
  );

  return calls;
}

function configure(overrides: Record<string, string> = {}) {
  vi.stubEnv('AI_CHAT_API_KEY', 'key');
  vi.stubEnv('AI_CHAT_BASE_URL', '');
  vi.stubEnv('AI_EMBEDDING_MODEL', 'text-embedding-3-small');
  vi.stubEnv('AI_EMBEDDING_DIMENSIONS', '');
  for (const [name, value] of Object.entries(overrides)) vi.stubEnv(name, value);
}

describe('readEmbeddings', () => {
  it('orders the vectors by index, not by the order the array arrived in', () => {
    const first = vector(1);
    const second = vector(2);

    // A proxy is free to reorder `data`; the index is what says which input a
    // vector belongs to.
    const payload = {
      data: [
        { index: 1, embedding: second },
        { index: 0, embedding: first },
      ],
    };

    expect(readEmbeddings(payload, EMBEDDING_GENERATION.dimensions)).toEqual([first, second]);
  });

  it('refuses a body that cannot be stored: a wrong width, a hole, a duplicate index', () => {
    const dimensions = EMBEDDING_GENERATION.dimensions;

    expect(readEmbeddings({ data: [{ index: 0, embedding: [1, 2, 3] }] }, dimensions)).toBeNull();
    expect(readEmbeddings({ data: [{ index: 1, embedding: vector() }] }, dimensions)).toBeNull();
    expect(readEmbeddings({ data: null }, dimensions)).toBeNull();
    expect(readEmbeddings({ data: [] }, dimensions)).toBeNull();
    expect(
      readEmbeddings(
        {
          data: [
            { index: 0, embedding: vector() },
            { index: 0, embedding: vector() },
          ],
        },
        dimensions
      )
    ).toBeNull();
    expect(readEmbeddings({ data: [{ index: 0, embedding: [1, Number.NaN] }] }, 2)).toBeNull();
  });
});

describe('the embedding client', () => {
  beforeEach(() => {
    resetEmbeddingWarnings();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is off with no key, and off with no model — a turn still answers', () => {
    vi.stubEnv('AI_CHAT_API_KEY', '');
    vi.stubEnv('OPENCODE_API_KEY', '');
    expect(createAiEmbeddingsClient()).toBeNull();

    configure({ AI_EMBEDDING_MODEL: '' });
    expect(createAiEmbeddingsClient()).toBeNull();
  });

  it('reports a width that does not match the index, once, to the operator', () => {
    configure({ AI_EMBEDDING_DIMENSIONS: '768' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(embeddingDimensionMismatch()).toEqual({
      configured: 768,
      generation: EMBEDDING_GENERATION.dimensions,
    });
    expect(createAiEmbeddingsClient()).toBeNull();
    expect(createAiEmbeddingsClient()).toBeNull();

    // A provider call would only produce vectors the index cannot hold.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('do not match the vector index');
  });

  it('sends one batch per thirty-two inputs, and answers in input order', async () => {
    configure();
    const calls = stubProvider(
      ({ input }) =>
        new Response(
          JSON.stringify({
            data: input
              .map((_, index) => ({ index, embedding: vector(index) }))
              // Reversed on the wire: the client must still answer in input order.
              .reverse(),
          }),
          { status: 200 }
        )
    );

    const client = createAiEmbeddingsClient();
    expect(client?.model).toBe('text-embedding-3-small');

    const texts = Array.from({ length: 65 }, (_, index) => `fact ${index}`);
    const vectors = await client!.embed(texts, new AbortController().signal);

    expect(calls).toHaveLength(3);
    expect(calls.map((call) => call.body.input.length)).toEqual([32, 32, 1]);
    expect(calls[0]?.url).toBe('https://opencode.ai/inference/go/openai/v1/embeddings');
    expect(calls[0]?.headers['x-opencode-session']).toBe('assistant');
    expect(vectors).toHaveLength(65);
    expect(vectors?.[1]?.[0]).toBe(1);
  });

  it('answers null — not an exception — when the provider refuses or the shape is wrong', async () => {
    configure();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    stubProvider(() => new Response('{"error":"no quota"}', { status: 429 }));
    expect(await createAiEmbeddingsClient()!.embed(['a'], new AbortController().signal)).toBeNull();

    stubProvider(() => new Response(JSON.stringify(answer([[1, 2, 3]])), { status: 200 }));
    expect(await createAiEmbeddingsClient()!.embed(['a'], new AbortController().signal)).toBeNull();

    expect(warn).toHaveBeenCalled();

    // A provider that is unreachable is the same answer: lexical recall.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNRESET');
      })
    );
    expect(await createAiEmbeddingsClient()!.embed(['a'], new AbortController().signal)).toBeNull();
  });

  it('calls the provider for nothing when there is nothing to embed', async () => {
    configure();
    const calls = stubProvider(() => new Response(JSON.stringify(answer([])), { status: 200 }));

    expect(await createAiEmbeddingsClient()!.embed([], new AbortController().signal)).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
