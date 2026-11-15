import type { AgentMemoryRepository } from '@/backend/repositories/agent/agent-memories-repository';
import type { MemoryEmbeddingsService } from '@/backend/services/agent/memory-embeddings-service';
import { AppError } from '@/backend/shared/errors';
import {
  AGENT_MEMORY_KINDS,
  AGENT_MEMORY_SCOPES,
  MEMORY_EMPTY,
  MEMORY_INVALID_KIND,
  MEMORY_SCOPE_KEY,
  MEMORY_TEXT_MAX,
  MEMORY_TOO_LONG,
  memoryRefusal,
  type AgentMemory,
  type AgentMemoryKind,
  type AgentMemoryScope,
  type RememberFactInput,
} from '@/backend/shared/domain/agent-memory';

/**
 * The one door a fact enters by (ADR-0182 decisions 2, 5 and 6, #1509).
 *
 * The tool calls `remember` today and extraction calls it next (#1511), which is
 * the whole reason this is a service and not a helper: a second insert path is
 * how the page and extraction start rendering shapes the other wrote. The
 * refusal, the normalisation and the duplicate answer therefore live here, once,
 * for both callers.
 *
 * The vector is the one thing this service cannot write itself —
 * `agent_memory_embeddings` has no member insert policy — so it hands the fact
 * to the embedding service and treats a refusal as a warning. A fact that could
 * not be embedded is still a fact; the backfill finds it in the pending view.
 */

/**
 * A fact the writer refused, in words meant for the member. It is a 400 because
 * nothing failed: the request asked for something a fact is not.
 */
export class MemoryRefusalError extends AppError {
  constructor(message: string) {
    super(message, 400, 'MEMORY_REFUSED');
    this.name = 'MemoryRefusalError';
  }
}

export interface AgentMemoryService {
  remember(input: RememberFactInput): Promise<AgentMemory>;
  /** The member's live facts, newest first. */
  list(userId: string): Promise<AgentMemory[]>;
  edit(
    userId: string,
    id: string,
    patch: { text?: string; kind?: AgentMemoryKind }
  ): Promise<AgentMemory | null>;
  /** Soft-deletes the row and the vector built from it. */
  forget(userId: string, id: string): Promise<boolean>;
}

export interface AgentMemoryServiceDeps {
  repository: AgentMemoryRepository;
  /** The vectors the fact needs, and the one it leaves behind. */
  embeddings: Pick<MemoryEmbeddingsService, 'embedFact' | 'forget'>;
}

function validated(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw new MemoryRefusalError(MEMORY_EMPTY);
  if (trimmed.length > MEMORY_TEXT_MAX) throw new MemoryRefusalError(MEMORY_TOO_LONG);

  const refusal = memoryRefusal(trimmed);
  if (refusal) throw new MemoryRefusalError(refusal);
  return trimmed;
}

function validatedKind(kind: string): AgentMemoryKind {
  if (!(AGENT_MEMORY_KINDS as readonly string[]).includes(kind)) {
    throw new MemoryRefusalError(MEMORY_INVALID_KIND);
  }
  return kind as AgentMemoryKind;
}

/** `scope` names its own key, and the table's check constraint says so too. */
function assertScopeKey(
  scope: AgentMemoryScope,
  product: string | null,
  threadId: string | null
): void {
  if (!(AGENT_MEMORY_SCOPES as readonly string[]).includes(scope)) {
    throw new MemoryRefusalError(MEMORY_SCOPE_KEY);
  }
  const coherent =
    (scope === 'account' && product === null && threadId === null) ||
    (scope === 'product' && product !== null && threadId === null) ||
    (scope === 'thread' && threadId !== null && product === null);
  if (!coherent) throw new MemoryRefusalError(MEMORY_SCOPE_KEY);
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function createAgentMemoryService({
  repository,
  embeddings,
}: AgentMemoryServiceDeps): AgentMemoryService {
  return {
    async remember(input) {
      const text = validated(input.text);
      const scope = input.scope ?? 'account';
      const product = input.product ?? null;
      const threadId = input.threadId ?? null;
      assertScopeKey(scope, product, threadId);

      const memory = await repository.insert({
        userId: input.userId,
        text,
        scope,
        product,
        threadId,
        kind: input.kind === undefined ? 'fact' : validatedKind(input.kind),
        sourceTurnId: input.sourceTurnId ?? null,
        confidence: clampConfidence(input.confidence ?? 1),
      });

      // Never throws, and answers a fact that is already current without a
      // provider call: the write path stays idempotent on a repeat.
      await embeddings.embedFact(memory.id);
      return memory;
    },

    async list(userId) {
      return repository.list(userId);
    },

    async edit(userId, id, patch) {
      const changes: { text?: string; kind?: AgentMemoryKind } = {};
      if (patch.text !== undefined) changes.text = validated(patch.text);
      if (patch.kind !== undefined) changes.kind = validatedKind(patch.kind);
      if (Object.keys(changes).length === 0) return repository.find(userId, id);

      const updated = await repository.update(userId, id, changes);
      // The row's `updated_at` moved, so its vector is stale: the pending view
      // queues it and this call is the write path that empties it.
      if (updated) await embeddings.embedFact(updated.id);
      return updated;
    },

    async forget(userId, id) {
      const forgotten = await repository.forget(userId, id, new Date().toISOString());
      // A soft delete reaches no foreign key, so the vector is deleted here
      // rather than left as a copy of text the member asked to forget.
      if (forgotten) await embeddings.forget(id);
      return forgotten;
    },
  };
}
