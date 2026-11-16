import { env } from '@/backend/config/env';
import { AI_CHAT_DEFAULT_BASE_URL } from '@/backend/clients/ai-chat';
import { logger } from '@/backend/shared/logger';
import {
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_GENERATION,
  EMBEDDING_MAX_INPUT_CHARS,
} from '@/backend/shared/domain/agent-memory';

/**
 * The assistant's embedding provider (ADR-0185 decisions 1, 4 and 5, #1425).
 *
 * A model of its own, on the same OpenAI-compatible endpoint and key as the
 * turns: `AI_EMBEDDING_MODEL` and `AI_EMBEDDING_DIMENSIONS`, independent of
 * `AI_CHAT_MODEL`. The vectors it answers are stored beside the rows they
 * describe (`agent_memory_embeddings`) and never fetched on a turn's read path.
 *
 * **It degrades, it does not fail.** No key, no model, a dimension that does not
 * match the index generation, a refused request, a timeout, a body without one
 * vector per input, or a vector of the wrong width all answer `null`. The caller
 * treats that as "no embeddings" — lexical recall, no recall — and a turn still
 * succeeds. The member never reads any of this; the operator reads one warning
 * per reason, which is the whole point of the log lines below.
 *
 * The endpoint is the chat provider's because that is the deployment's one
 * credential (ADR-0113), not because the two models are related.
 */

/** A batch that has not answered in this long is a provider that hung, not a slow one. */
export const EMBEDDING_TIMEOUT_MS = 10_000;

export interface AiEmbeddingsClient {
  readonly model: string;
  readonly dimensions: number;
  /**
   * One vector per input, in input order, or `null` when the provider could not
   * answer. Batched: a hundred facts are four calls, not a hundred.
   */
  embed(texts: string[], signal: AbortSignal): Promise<number[][] | null>;
}

/** The width this deployment is configured for, generation included. */
export interface EmbeddingConfiguration {
  model: string;
  dimensions: number;
}

/** Warnings are for the operator, so each reason is said once, not once per turn. */
const warned = new Set<string>();

function warnOnce(reason: string, message: string, context?: Record<string, unknown>): void {
  if (warned.has(reason)) return;
  warned.add(reason);
  logger.warn(message, context);
}

/** Only the tests need this: it makes "one warning per reason" observable. */
export function resetEmbeddingWarnings(): void {
  warned.clear();
}

/**
 * The width `agent_memory_embeddings.embedding` was created with. A configured
 * value that differs is a deployment waiting for its own table generation
 * (ADR-0185 decision 6), so the answer is the mismatch — not a guess, and not a
 * write Postgres would refuse anyway.
 */
export function embeddingDimensionMismatch(): { configured: number; generation: number } | null {
  const configured = env.aiEmbeddingDimensions;
  if (configured === undefined || configured === EMBEDDING_GENERATION.dimensions) return null;
  return { configured, generation: EMBEDDING_GENERATION.dimensions };
}

/**
 * One response body as vectors in input order.
 *
 * The provider numbers each result and a proxy is free to reorder the array, so
 * the `index` is what orders them; trusting wire order would attach one fact's
 * meaning to another fact's row, which no later check would catch.
 */
export function readEmbeddings(payload: unknown, dimensions: number): number[][] | null {
  if (typeof payload !== 'object' || payload === null) return null;

  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) return null;

  const vectors: number[][] = [];
  for (const entry of data) {
    if (typeof entry !== 'object' || entry === null) return null;

    const index = (entry as { index?: unknown }).index;
    const embedding = (entry as { embedding?: unknown }).embedding;
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return null;
    if (!Array.isArray(embedding) || embedding.length !== dimensions) return null;
    if (!embedding.every((value) => typeof value === 'number' && Number.isFinite(value))) {
      return null;
    }

    // A duplicated index is a broken answer, not a tie to break.
    if (vectors[index] !== undefined) return null;
    vectors[index] = embedding as number[];
  }

  // No holes: every input came back exactly once.
  if (vectors.length !== data.length || vectors.some((vector) => vector === undefined)) return null;
  return vectors;
}

/** The configured client, or `null` when embeddings are off or cannot be stored. */
export interface EmbeddingClientOptions {
  /**
   * The width the caller can store. Defaults to the memory generation; the
   * specialist index passes its own, because a roster artifact and a vector
   * column are two independent generations (ADR-0185 decision 6, ADR-0190).
   */
  dimensions?: number;
}

export function createAiEmbeddingsClient(
  options: EmbeddingClientOptions = {}
): AiEmbeddingsClient | null {
  const apiKey = env.aiEmbeddingApiKey ?? env.aiChatApiKey;
  const model = env.aiEmbeddingModel;

  if (!apiKey || !model) return null;

  const dimensions = options.dimensions ?? EMBEDDING_GENERATION.dimensions;
  if (options.dimensions === undefined) {
    const mismatch = embeddingDimensionMismatch();
    if (mismatch) {
      warnOnce(
        'dimensions',
        'Embedding dimensions do not match the vector index; recall stays lexical until the new generation is backfilled',
        { ...mismatch, table: EMBEDDING_GENERATION.table }
      );
      return null;
    }
  } else if (env.aiEmbeddingDimensions !== undefined && env.aiEmbeddingDimensions !== dimensions) {
    // A caller that can only store 1024 asked a provider configured for
    // something else. Storing one width in a place that expects another is the
    // one failure no later check catches, so this answers "no embeddings".
    warnOnce(
      `dimensions:${dimensions}`,
      'The embedding width does not match what this caller can store; it stays lexical',
      { configured: env.aiEmbeddingDimensions, expected: dimensions }
    );
    return null;
  }

  const baseUrl = (
    env.aiEmbeddingBaseUrl ||
    env.aiChatBaseUrl?.trim() ||
    AI_CHAT_DEFAULT_BASE_URL
  ).replace(/\/+$/, '');

  async function embedBatch(texts: string[], signal: AbortSignal): Promise<number[][] | null> {
    const inputs = texts
      .map((text) => text.trim().slice(0, EMBEDDING_MAX_INPUT_CHARS))
      .filter((text) => text.length > 0);
    if (inputs.length === 0) return [];

    let response: Response;
    // The caller's signal ends the batch when the request that asked for it is
    // gone; the timer ends it when the provider simply never answers.
    const controller = new AbortController();
    const forwardAbort = () => controller.abort(signal.reason);
    signal.addEventListener('abort', forwardAbort, { once: true });
    const timer = setTimeout(
      () => controller.abort(new Error('embedding timeout')),
      EMBEDDING_TIMEOUT_MS
    );

    try {
      response = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          // The gateway refuses a call without a session name, the same as a turn.
          'x-opencode-session': 'assistant',
        },
        body: JSON.stringify({ model, input: inputs }),
        signal: controller.signal,
        cache: 'no-store',
      });
    } catch (error) {
      warnOnce('unreachable', 'Embedding provider did not answer; recall stays lexical', {
        error: String(error),
      });
      return null;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', forwardAbort);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      warnOnce(
        `status:${response.status}`,
        'Embedding provider refused the request; recall stays lexical',
        { status: response.status, detail: detail.slice(0, 500) }
      );
      return null;
    }

    const payload = (await response.json().catch(() => null)) as unknown;
    const vectors = readEmbeddings(payload, dimensions);
    if (!vectors || vectors.length !== inputs.length) {
      warnOnce(
        'shape',
        'Embedding provider answered a body this deployment cannot store; recall stays lexical',
        { expected: inputs.length, dimensions }
      );
      return null;
    }

    return vectors;
  }

  return {
    model,
    dimensions,
    async embed(texts, signal) {
      if (texts.length === 0) return [];

      const vectors: number[][] = [];
      for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
        const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE);
        const answered = await embedBatch(batch, signal);
        // Half a batch is not a batch: a partial write would make some facts
        // recallable and leave the rest silently behind.
        if (answered === null) return null;
        vectors.push(...answered);
      }

      return vectors;
    },
  };
}
