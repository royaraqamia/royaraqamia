import type { AiEmbeddingsClient } from '@/backend/clients/ai-embeddings';
import { logger } from '@/backend/shared/logger';
import {
  EMBEDDING_GENERATION,
  EMBEDDING_MAX_INPUT_CHARS,
  RECALL_CANDIDATES,
  RECALL_QUERY_TIMEOUT_MS,
  rankRecall,
  type RecallScope,
  type RecalledMemory,
} from '@/backend/shared/domain/agent-memory';

/**
 * The turn's read of memory (ADR-0182 decision 3, #1510).
 *
 * Two halves, and the seam between them is the point. The query vector is the
 * read path's only provider spend: one small embedding of the member's own
 * message, once per turn, capped and deadlined. The search itself is a single
 * call the service role already answered for `nearest` — the function is the
 * filter (one member, live rows, the thread's own scope), this service is the
 * ranking (floor, decay, six).
 *
 * **It degrades, it never fails.** No provider, no vector, a refused request, a
 * timeout, a database error: every one of them is an empty list, which the turn
 * reads as "no recall block". The member sees exactly the answer they would see
 * without memory, and the operator reads one warning — a recall that is not
 * there must not be a turn that is not there either.
 */
export interface RecallQuery extends RecallScope {
  userId: string;
  /** The member's own message: never the history, never a tool's output. */
  question: string;
  /**
   * The turn's own query vector, when the turn already spent the call (#1448).
   * Shared with the specialist shortlist so one message costs one embedding;
   * a width the memory generation cannot store is ignored, not passed on.
   */
  vector?: readonly number[] | null;
  /** The request's signal, so a member who leaves stops the embedding call. */
  signal?: AbortSignal;
}

export interface AgentRecallService {
  /** At most six cited facts, or none at all. Never throws. */
  recall(query: RecallQuery): Promise<RecalledMemory[]>;
}

export interface AgentRecallDeps {
  /** The k nearest live facts inside `scope`; the function's own cap holds. */
  nearest(
    userId: string,
    embedding: number[],
    scope: RecallScope,
    limit: number
  ): Promise<RecalledMemory[]>;
  /** `null` when embeddings are off: no key, no model, or a width the index lacks. */
  client: AiEmbeddingsClient | null;
  /** The clock the decay reads; a test pins it so an order is an assertion. */
  now?: () => number;
}

export function createAgentRecallService({
  nearest,
  client,
  now = Date.now,
}: AgentRecallDeps): AgentRecallService {
  return {
    async recall({ userId, question, threadId, product, signal, vector }) {
      // The turn's own vector, when it has one of the width this table stores
      // (#1448). It was paid for once, by whichever layer asked first.
      const shared =
        vector && vector.length === EMBEDDING_GENERATION.dimensions ? [...vector] : null;
      // Embeddings off is a supported state, not a failure: no call, no block,
      // and the turn answers exactly as it did before this service existed.
      if (!client && !shared) return [];

      const text = question.trim().slice(0, EMBEDDING_MAX_INPUT_CHARS);
      if (!text && !shared) return [];

      // Recall sits in front of the stream, so its budget is the turn's: the
      // provider's own timeout is larger, and a member waiting on a hanging
      // embedding should lose the memory, not the answer.
      const deadline = new AbortController();
      const timer = setTimeout(
        () => deadline.abort(new Error('recall deadline')),
        RECALL_QUERY_TIMEOUT_MS
      );
      const forwardAbort = () => deadline.abort(signal?.reason);
      signal?.addEventListener('abort', forwardAbort, { once: true });

      try {
        const vector = shared ?? (await client?.embed([text], deadline.signal))?.[0];
        // The client already logged the *provider's* reason once; a null here
        // is a turn without recall, not a second line every message.
        if (!vector) return [];

        const candidates = await nearest(userId, vector, { threadId, product }, RECALL_CANDIDATES);
        return rankRecall(candidates, now());
      } catch (error) {
        // The operator's line, never the member's: the turn is unchanged.
        logger.warn('Recall was skipped for this turn', { error: String(error) });
        return [];
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', forwardAbort);
      }
    },
  };
}
