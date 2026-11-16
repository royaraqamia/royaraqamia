import type { AiEmbeddingsClient } from '@/backend/clients/ai-embeddings';
import {
  EMBEDDING_MAX_INPUT_CHARS,
  RECALL_QUERY_TIMEOUT_MS,
} from '@/backend/shared/domain/agent-memory';
import { logger } from '@/backend/shared/logger';

/**
 * The turn's one query vector (ADR-0185 decision 5, #1448).
 *
 * Memory recall and the specialist shortlist both ask what this message is
 * about. Asking the provider twice would double the read path's only spend to
 * learn the same thing, so they share one vector: the first caller embeds the
 * message, the second reads the answer. A deployment with no provider answers
 * `null`, and both callers fall back to words.
 *
 * It never throws. A refused request, a timeout, a member who leaves — the
 * turn loses the vector, not the answer.
 */
export interface TurnEmbedding {
  /** The message's vector, or `null` when this turn cannot have one. */
  vector(question: string, signal?: AbortSignal): Promise<number[] | null>;
}

export function createTurnEmbedding(client: AiEmbeddingsClient | null): TurnEmbedding {
  let asked: string | null = null;
  let pending: Promise<number[] | null> | null = null;

  async function embed(text: string, signal?: AbortSignal): Promise<number[] | null> {
    if (!client) return null;
    // Recall sits in front of the stream, so the budget is the turn's own: a
    // hanging provider costs a bounded pause, never the member's answer.
    const deadline = new AbortController();
    const timer = setTimeout(
      () => deadline.abort(new Error('turn embedding deadline')),
      RECALL_QUERY_TIMEOUT_MS
    );
    const forwardAbort = () => deadline.abort(signal?.reason);
    signal?.addEventListener('abort', forwardAbort, { once: true });

    try {
      const vectors = await client.embed([text], deadline.signal);
      return vectors?.[0] ?? null;
    } catch (error) {
      // The operator's line, never the member's.
      logger.warn('The turn carried no query vector', { error: String(error) });
      return null;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', forwardAbort);
    }
  }

  return {
    vector(question, signal) {
      if (!client) return Promise.resolve(null);

      const text = question.trim().slice(0, EMBEDDING_MAX_INPUT_CHARS);
      if (!text) return Promise.resolve(null);
      if (pending && asked === text) return pending;

      asked = text;
      pending = embed(text, signal);
      return pending;
    },
  };
}
