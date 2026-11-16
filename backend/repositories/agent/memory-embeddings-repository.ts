import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { repositoryFailure } from '@/backend/shared/repository-error';
import {
  EMBEDDING_GENERATION,
  type EmbeddingCounts,
  type EmbeddingSource,
  type EmbeddingWrite,
  type RecallScope,
  type RecalledMemory,
} from '@/backend/shared/domain/agent-memory';

type PendingRow = Database['public']['Views']['agent_embedding_pending']['Row'];
type NearestRow =
  Database['public']['Functions'][typeof EMBEDDING_GENERATION.nearestFunction]['Returns'][number];

/**
 * A pgvector literal, from the array a provider returned.
 *
 * PostgREST carries a vector as a string — `[0.1,0.2,…]` — because JSON has no
 * fraction-free way to say `vector`. `JSON.stringify` is exactly that format for
 * a plain number array, which is what `readEmbeddings` guarantees.
 */
export function toVectorLiteral(embedding: number[]): string {
  return JSON.stringify(embedding);
}

function toSource(row: PendingRow): EmbeddingSource | null {
  // The view's columns are nullable only because a view's are: `source_id` and
  // `body` come from a non-null fact. A row without them is not a fact to embed,
  // so it is skipped rather than embedded as the empty string.
  if (row.source_id === null || row.user_id === null || row.body === null) return null;
  if (row.source_updated_at === null) return null;

  return {
    kind: 'fact',
    id: row.source_id,
    userId: row.user_id,
    text: row.body,
    sourceUpdatedAt: row.source_updated_at,
  };
}

/**
 * The vector store's data access (ADR-0185, #1425).
 *
 * A vector is written, never read to be built: `pending` and `pendingFor` answer
 * the work list from `agent_embedding_pending`, and `write` is the upsert that
 * empties it. Nothing here calls a provider — that seam is the client, and the
 * two places they meet are the write path and the backfill.
 *
 * `nearest` is the only read of the index: it hands PostgREST a query vector the
 * caller already has and asks the function for the k nearest facts in the
 * caller's thread and product — a thread-scoped fact is not another thread's
 * memory (ADR-0182 decision 3). A turn's read path therefore spends one query,
 * not one provider call (decision 5).
 */
export interface MemoryEmbeddingsRepository {
  /** Facts with no vector, or a vector older than the fact. Oldest first. */
  pending(limit: number): Promise<EmbeddingSource[]>;
  /** The same question for one fact: the write path's "is there work for this?". */
  pendingFor(memoryId: string): Promise<EmbeddingSource | null>;
  /** Upserts by `memory_id`, so a re-run replaces instead of adding. */
  write(rows: EmbeddingWrite[]): Promise<number>;
  /** The k nearest active facts for one member in this thread and product. */
  nearest(
    userId: string,
    embedding: number[],
    limit: number,
    scope: RecallScope
  ): Promise<RecalledMemory[]>;
  /** What a backfill reports: rows held, and rows still queued. */
  counts(): Promise<EmbeddingCounts>;
}

export function createSupabaseMemoryEmbeddingsRepository(
  supabase: SupabaseClient<Database>
): MemoryEmbeddingsRepository {
  return {
    async pending(limit) {
      const { data, error } = await supabase
        .from('agent_embedding_pending')
        .select('source_kind, source_id, user_id, body, source_updated_at')
        .limit(limit);

      if (error) throw repositoryFailure('memory.embeddings.pending', error);
      return (data ?? []).map(toSource).filter((row): row is EmbeddingSource => row !== null);
    },

    async pendingFor(memoryId) {
      const { data, error } = await supabase
        .from('agent_embedding_pending')
        .select('source_kind, source_id, user_id, body, source_updated_at')
        .eq('source_id', memoryId)
        .maybeSingle();

      if (error) throw repositoryFailure('memory.embeddings.pendingFor', error);
      return data ? toSource(data) : null;
    },

    async write(rows) {
      if (rows.length === 0) return 0;

      const { error } = await supabase.from(EMBEDDING_GENERATION.table).upsert(
        rows.map((row) => ({
          user_id: row.userId,
          memory_id: row.id,
          model: row.model,
          source_updated_at: row.sourceUpdatedAt,
          embedding: toVectorLiteral(row.embedding),
        })),
        { onConflict: 'memory_id' }
      );

      if (error) throw repositoryFailure('memory.embeddings.write', error);
      return rows.length;
    },

    async nearest(userId, embedding, limit, scope) {
      const { data, error } = await supabase.rpc(EMBEDDING_GENERATION.nearestFunction, {
        p_user_id: userId,
        p_query: toVectorLiteral(embedding),
        p_limit: limit,
        p_thread_id: scope.threadId,
        p_product: scope.product,
      });

      if (error) throw repositoryFailure('memory.embeddings.nearest', error);
      return ((data ?? []) as NearestRow[]).map((row) => ({
        memoryId: row.memory_id,
        text: row.text,
        similarity: Number(row.similarity),
        updatedAt: row.updated_at,
      }));
    },

    async counts() {
      const stored = await supabase
        .from(EMBEDDING_GENERATION.table)
        .select('id', { count: 'exact', head: true });
      if (stored.error) throw repositoryFailure('memory.embeddings.counts.stored', stored.error);

      const pending = await supabase
        .from('agent_embedding_pending')
        .select('source_id', { count: 'exact', head: true });
      if (pending.error) throw repositoryFailure('memory.embeddings.counts.pending', pending.error);

      return { stored: stored.count ?? 0, pending: pending.count ?? 0 };
    },
  };
}
