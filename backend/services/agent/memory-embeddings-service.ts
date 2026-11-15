import type { AiEmbeddingsClient } from '@/backend/clients/ai-embeddings';
import type { MemoryEmbeddingsRepository } from '@/backend/repositories/agent/memory-embeddings-repository';
import { logger } from '@/backend/shared/logger';
import {
  EMBEDDING_BATCH_SIZE,
  RECALL_MAX_ITEMS,
  type BackfillReport,
  type EmbeddingSource,
  type EmbeddingWrite,
  type RecalledMemory,
} from '@/backend/shared/domain/agent-memory';

/**
 * Embedding a fact, and finding facts again (ADR-0185 decisions 4–6, #1425).
 *
 * The seam is deliberate. The service is the only place that knows both the
 * repository and the provider, and it spends the provider exactly where a write
 * happens:
 *
 * - `embedFact` is the write path. A fact was just written (by the `remember`
 *   tool, by extraction, or by the memory page), so its vector is computed once,
 *   for that row. It answers `false` — never an exception — when the fetcher is
 *   off or the provider refused, because a memory that cannot be embedded is
 *   still a memory.
 * - `backfill` is the operator's path: the same work in batches, resumable by
 *   construction, because every written row leaves the pending view.
 * - `nearest` is the read path, and it calls no provider at all: it is handed a
 *   vector somebody else already has. A turn therefore never pays for an
 *   embedding call to read its own recall (decision 5).
 */
export interface MemoryEmbeddingsService {
  /** Embeds what is pending, oldest first, in batches. Never throws. */
  backfill(options?: BackfillOptions): Promise<BackfillReport>;
  /** The write path: one fact, right after it was written. Never throws. */
  embedFact(memoryId: string, signal?: AbortSignal): Promise<boolean>;
  /** The read path: the k nearest facts for one member, from a given vector. */
  nearest(userId: string, embedding: number[], limit?: number): Promise<RecalledMemory[]>;
}

export interface BackfillOptions {
  /** A run's ceiling, so a large table is many runs instead of one long one. */
  maxBatches?: number;
  batchSize?: number;
  signal?: AbortSignal;
}

export interface MemoryEmbeddingsDeps {
  repository: MemoryEmbeddingsRepository;
  /** `null` when embeddings are off: no key, no model, or a width the index lacks. */
  client: AiEmbeddingsClient | null;
}

const DEFAULT_MAX_BATCHES = 50;

/** A source and the vector that answers it, in the row shape the repository writes. */
function toWrite(source: EmbeddingSource, model: string, embedding: number[]): EmbeddingWrite {
  return {
    kind: source.kind,
    id: source.id,
    userId: source.userId,
    model,
    sourceUpdatedAt: source.sourceUpdatedAt,
    embedding,
  };
}

export function createMemoryEmbeddingsService({
  repository,
  client,
}: MemoryEmbeddingsDeps): MemoryEmbeddingsService {
  return {
    async backfill({
      maxBatches = DEFAULT_MAX_BATCHES,
      batchSize = EMBEDDING_BATCH_SIZE,
      signal = new AbortController().signal,
    }: BackfillOptions = {}) {
      let embedded = 0;
      let batches = 0;

      if (!client) {
        // No provider is a supported state, not a failure: the queue is reported
        // so the operator sees what waits for one, and nothing is touched.
        const { pending } = await repository.counts();
        return { embedded, batches, stopped: 'provider', pending };
      }

      for (;;) {
        if (batches >= maxBatches) {
          const { pending } = await repository.counts();
          return { embedded, batches, stopped: 'batch-limit', pending };
        }

        const batch = await repository.pending(batchSize);
        if (batch.length === 0) return { embedded, batches, stopped: 'done', pending: 0 };

        // One provider call per batch, and the whole batch or none of it: a
        // partial write would make some facts recallable and leave the rest
        // quietly behind, with the same rows queued again next run.
        const vectors = await client.embed(
          batch.map((source) => source.text),
          signal
        );
        if (!vectors || vectors.length !== batch.length) {
          const { pending } = await repository.counts();
          return { embedded, batches, stopped: 'provider', pending };
        }

        const rows: EmbeddingWrite[] = [];
        for (const [index, source] of batch.entries()) {
          const embedding = vectors[index];
          if (!embedding) break;
          rows.push(toWrite(source, client.model, embedding));
        }
        if (rows.length !== batch.length) {
          const { pending } = await repository.counts();
          return { embedded, batches, stopped: 'provider', pending };
        }

        embedded += await repository.write(rows);
        batches += 1;
      }
    },

    async embedFact(memoryId, signal = new AbortController().signal) {
      if (!client) return false;

      try {
        // Asked of the pending view, not of the table: a fact already holding a
        // current vector is not work, and asking is how the write path stays
        // idempotent without comparing timestamps in JavaScript.
        const source = await repository.pendingFor(memoryId);
        if (!source) return false;

        const vectors = await client.embed([source.text], signal);
        const embedding = vectors?.[0];
        if (!embedding) return false;

        await repository.write([toWrite(source, client.model, embedding)]);
        return true;
      } catch (error) {
        // The fact is stored; only its vector is missing. The backfill picks it
        // up, so this is a warning rather than a failed turn (decision 4).
        logger.warn('A memory was saved without its embedding; the backfill will pick it up', {
          memoryId,
          error: String(error),
        });
        return false;
      }
    },

    async nearest(userId, embedding, limit = RECALL_MAX_ITEMS) {
      const wanted = Math.min(Math.max(1, limit), RECALL_MAX_ITEMS);
      return repository.nearest(userId, embedding, wanted);
    },
  };
}
