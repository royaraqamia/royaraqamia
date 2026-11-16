import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { repositoryFailure } from '@/backend/shared/repository-error';
import {
  DEFAULT_MEMORY_SETTINGS,
  type AgentMemory,
  type AgentMemoryKind,
  type AgentMemoryScope,
  type AgentMemorySettings,
} from '@/backend/shared/domain/agent-memory';

type MemoryRow = Database['public']['Tables']['agent_memories']['Row'];
type SettingsRow = Database['public']['Tables']['agent_memory_settings']['Row'];

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
  /**
   * Soft-deletes the row and deletes its vector, in one transaction
   * (`agent_memory_forget`). Answers whether a live fact was forgotten.
   */
  forget(id: string): Promise<boolean>;
  /** The same for every live thread fact of one conversation; answers how many. */
  forgetThread(threadId: string): Promise<number>;
  /** The member's switches, with the defaults when they have never set any. */
  settings(userId: string): Promise<AgentMemorySettings>;
  /** Writes only the switches given, and answers every one of them. */
  saveSettings(userId: string, patch: Partial<AgentMemorySettings>): Promise<AgentMemorySettings>;
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

function toSettings(row: SettingsRow | null): AgentMemorySettings {
  if (!row) return DEFAULT_MEMORY_SETTINGS;
  return {
    account: row.account_enabled,
    product: row.product_enabled,
    thread: row.thread_enabled,
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

  /** The member's switches, or the defaults when they have never set any. */
  async function readSettings(userId: string): Promise<AgentMemorySettings> {
    const { data, error } = await supabase
      .from('agent_memory_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw repositoryFailure('agent.memories.settings', error);
    return toSettings(data);
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

    async forget(id) {
      // One call, two statements, one transaction: the vector cannot outlive the
      // fact it describes (ADR-0182 decision 6). The member is not an argument —
      // the function reads `auth.uid()` from the caller's own session and touches
      // no other member's row.
      const { data, error } = await supabase.rpc('agent_memory_forget', { p_memory_id: id });

      if (error) throw repositoryFailure('agent.memories.forget', error);
      return data === true;
    },

    async forgetThread(threadId) {
      const { data, error } = await supabase.rpc('agent_memory_forget_thread', {
        p_thread_id: threadId,
      });

      if (error) throw repositoryFailure('agent.memories.forgetThread', error);
      return typeof data === 'number' ? data : 0;
    },

    async settings(userId) {
      return readSettings(userId);
    },

    async saveSettings(userId, patch) {
      const current = await readSettings(userId);
      const next: AgentMemorySettings = { ...current, ...patch };

      const { data, error } = await supabase
        .from('agent_memory_settings')
        .upsert(
          {
            user_id: userId,
            account_enabled: next.account,
            product_enabled: next.product,
            thread_enabled: next.thread,
          },
          { onConflict: 'user_id' }
        )
        .select('*')
        .single();

      if (error) throw repositoryFailure('agent.memories.saveSettings', error);
      return toSettings(data);
    },
  };
}
