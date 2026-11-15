/**
 * The embedding generation behind recall (ADR-0185 decisions 1, 4 and 6,
 * ADR-0182 decision 3, #1425).
 *
 * Two things here are fixed on purpose, and neither is a tuning knob:
 *
 * - The width. `agent_memory_embeddings.embedding` is `vector(1536)`, so a model
 *   that answers another width cannot be stored at all — Postgres refuses the
 *   write rather than mixing two spaces in one index. That is why a dimension
 *   change is a new table generation and a backfill (decision 6), not an
 *   in-place reindex: the old table keeps answering while the new one fills.
 * - The batch. Vectors are written when a row is written, never on a turn's
 *   read path (decision 5), so the write is one provider call for many rows.
 *
 * `AI_EMBEDDING_DIMENSIONS` is read against `dimensions` below. A deployment
 * that configures a different width is not broken and not guessed at: the
 * embedding path switches itself off, recall falls back to lexical, and the
 * operator reads one warning.
 */

export const EMBEDDING_GENERATION = {
  /** Where the vectors live. A new width is a new table, not the same one reindexed. */
  table: 'agent_memory_embeddings',
  /** The fixed width of `embedding`; an index needs it known at DDL time. */
  dimensions: 1536,
} as const;

/** Rows per provider call. One write of a batch, never one call per row. */
export const EMBEDDING_BATCH_SIZE = 32;

/** Recall takes at most six items, with their source (ADR-0182 decision 3). */
export const RECALL_MAX_ITEMS = 6;

/** A fact is 1–500 characters, so this only guards a provider's own limit. */
export const EMBEDDING_MAX_INPUT_CHARS = 2000;

/**
 * What a vector describes. `fact` is the only source today; the thread summary
 * is the next one, and it arrives with the table that holds it (#1426) rather
 * than as a column nothing can fill.
 */
export type EmbeddingSourceKind = 'fact';

/** One row waiting for a vector: the memory and the text it was built from. */
export interface EmbeddingSource {
  kind: EmbeddingSourceKind;
  id: string;
  userId: string;
  text: string;
  /** The fact's `updated_at` at read time: the vector is stale when it moves. */
  sourceUpdatedAt: string;
}

/** One vector to store. `sourceUpdatedAt` is what the vector was built from. */
export interface EmbeddingWrite {
  kind: EmbeddingSourceKind;
  id: string;
  userId: string;
  model: string;
  sourceUpdatedAt: string;
  embedding: number[];
}

/** What a stored vector was made of, for the operator's report. */
export interface EmbeddingCounts {
  /** Rows the generation holds. */
  stored: number;
  /** Rows still waiting, or stale after an edit. */
  pending: number;
}

/** Why a backfill stopped before the queue was empty. */
export type BackfillStop = 'done' | 'provider' | 'batch-limit';

/** The one line the operator reads after `npm run embeddings:backfill`. */
export interface BackfillReport {
  embedded: number;
  batches: number;
  stopped: BackfillStop;
  /** What was left when the run ended; only a `provider` stop means it is blocked. */
  pending: number;
}

/** A fact recall may inject, with the score that put it there. */
export interface RecalledMemory {
  memoryId: string;
  text: string;
  /** Cosine similarity in 0–1; the floor and the recency decay are #1426's. */
  similarity: number;
  updatedAt: string;
}
