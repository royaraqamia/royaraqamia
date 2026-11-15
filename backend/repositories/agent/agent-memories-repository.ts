import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { repositoryFailure } from '@/backend/shared/repository-error';
import type {
  AgentMemory,
  AgentMemoryKind,
  AgentMemoryScope,
} from '@/backend/shared/domain/agent-memory';

type MemoryRow = Database['public']['Tables']['agent_memories']['Row'];

/**
 * The fact store's data access (ADR-0182 decisions 2, 6 and 7, #1509).
 *
 * Two rules are structural here rather than remembered:
 *
 * - **The member's own session is the client.** Every query is written as the
 *   caller, and every one also filters `user_id` explicitly: RLS is the
 *   boundary, and the filter is what keeps a service-role caller (extraction
 *   writes with #1511) from being able to name somebody else by accident.
 * - **A repeat is the same fact.** `uq_agent_memories_active_fact` refuses a
 *   second live row with the same key and text, and `insert` answers the row
 *   that exists instead of raising: the member saying "remember the 15th"
 *   twice did not ask for two memories.
 *
 * `deleted_at` is a soft delete, so every read narrows to live rows and the
 * unique index only guards what recall may still inject.
 */

export interface AgentMemoryWrite {
  userId: string;
  text: string;
  scope: AgentMemoryScope;
  product: string | null;
  threadId: string | null;
  kind: AgentMemoryKind;
  sourceTurnId: string | null;
  confidence: number;
}

export interface AgentMemoryPatch {
  text?: string;
  kind?: AgentMemoryKind;
}

export interface AgentMemoryRepository {
  /** The member's live facts, newest first: what the page shows and recall reads. */
  list(userId: string): Promise<AgentMemory[]>;
  find(userId: string, id: string): Promise<AgentMemory | null>;
  /** Answers the existing live row when the fact is already saved. */
  insert(input: AgentMemoryWrite): Promise<AgentMemory>;
  update(userId: string, id: string, patch: AgentMemoryPatch): Promise<AgentMemory | null>;
  /** Soft delete, at a time the caller names so the service owns the clock. */
  forget(userId: string, id: string, at: string): Promise<boolean>;
}

/** The columns the unique index compares, in the same normal form. */
function normaliseFact(text: string): string {
  return text.trim().toLocaleLowerCase();
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

function toMemory(row: MemoryRow): AgentMemory {
  return {
    id: row.id,
    scope: row.scope as AgentMemoryScope,
    product: row.product,
    threadId: row.thread_id,
    kind: row.kind as AgentMemoryKind,
    text: row.text,
    sourceTurnId: row.source_turn_id,
    confidence: Number(row.confidence),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSupabaseAgentMemoriesRepository(
  supabase: SupabaseClient<Database>
): AgentMemoryRepository {
  async function list(userId: string): Promise<AgentMemory[]> {
    const { data, error } = await supabase
      .from('agent_memories')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw repositoryFailure('agent.memories.list', error);
    return (data ?? []).map(toMemory);
  }

  /** The row the insert was refused for: same key, same text, still live. */
  async function findDuplicate(input: AgentMemoryWrite): Promise<AgentMemory | null> {
    const wanted = normaliseFact(input.text);
    const live = await list(input.userId);
    return (
      live.find(
        (memory) =>
          memory.scope === input.scope &&
          memory.product === input.product &&
          memory.threadId === input.threadId &&
          memory.kind === input.kind &&
          normaliseFact(memory.text) === wanted
      ) ?? null
    );
  }

  return {
    list,

    async find(userId, id) {
      const { data, error } = await supabase
        .from('agent_memories')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) throw repositoryFailure('agent.memories.find', error);
      return data ? toMemory(data) : null;
    },

    async insert(input) {
      const { data, error } = await supabase
        .from('agent_memories')
        .insert({
          user_id: input.userId,
          text: input.text,
          scope: input.scope,
          product: input.product,
          thread_id: input.threadId,
          kind: input.kind,
          source_turn_id: input.sourceTurnId,
          confidence: input.confidence,
        })
        .select('*')
        .single();

      if (!error && data) return toMemory(data);

      if (isUniqueViolation(error)) {
        const existing = await findDuplicate(input);
        if (existing) return existing;
      }

      throw repositoryFailure('agent.memories.insert', error);
    },

    async update(userId, id, patch) {
      const changes: { text?: string; kind?: AgentMemoryKind } = {};
      if (patch.text !== undefined) changes.text = patch.text;
      if (patch.kind !== undefined) changes.kind = patch.kind;

      const { data, error } = await supabase
        .from('agent_memories')
        .update(changes)
        .eq('id', id)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .select('*')
        .maybeSingle();

      if (error) throw repositoryFailure('agent.memories.update', error);
      return data ? toMemory(data) : null;
    },

    async forget(userId, id, at) {
      const { data, error } = await supabase
        .from('agent_memories')
        .update({ deleted_at: at })
        .eq('id', id)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .select('id')
        .maybeSingle();

      if (error) throw repositoryFailure('agent.memories.forget', error);
      return data !== null;
    },
  };
}
