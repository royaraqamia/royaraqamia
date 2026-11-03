import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Json } from '@/backend/models/database.types';
import { repositoryFailure } from '@/backend/shared/repository-error';
import type { ChatAgentAction, ChatAgentActionStatus } from '@/shared/contracts/chat-agent-actions';

type ActionRow = Database['public']['Tables']['chat_agent_actions']['Row'];

export interface ChatAgentActionRecord {
  id: string;
  conversationId: string;
  messageId: string;
  tool: string;
  args: Record<string, unknown>;
  status: ChatAgentActionStatus;
  result: Record<string, unknown> | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

function asObject(value: Json | null): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toRecord(row: ActionRow): ChatAgentActionRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    tool: row.tool,
    args: asObject(row.args) ?? {},
    status: row.status as ChatAgentActionStatus,
    result: asObject(row.result),
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
  };
}

/** The row as the thread draws it, which is the record minus its column names. */
export function toChatAgentAction(record: ChatAgentActionRecord): ChatAgentAction {
  return {
    id: record.id,
    conversationId: record.conversationId,
    messageId: record.messageId,
    tool: record.tool,
    args: record.args,
    status: record.status,
    result: record.result,
    createdAt: record.createdAt,
    resolvedAt: record.resolvedAt,
    resolvedBy: record.resolvedBy,
  };
}

/**
 * The proposals of one thread (ADR-0113, #818).
 *
 * Reads and resolutions run on the caller's own client, so RLS decides which
 * rows exist for them: the conversation's members read, and the member whose
 * confirmation claimed a row is the only one who can finish it. The insert is
 * the exception, and deliberate: a proposal is the model's output, so a member
 * must not be able to forge one — the repository writes it with the service
 * role, exactly like the assistant's own reply (#817).
 */
export interface ChatAgentActionRepository {
  listForMessages(messageIds: string[]): Promise<ChatAgentActionRecord[]>;
  find(conversationId: string, actionId: string): Promise<ChatAgentActionRecord | null>;
  /**
   * `proposed` -> `confirmed`, as one conditional write. An empty answer means
   * another request already resolved the row, which is what makes a double tap
   * apply once.
   */
  claim(
    conversationId: string,
    actionId: string,
    userId: string
  ): Promise<ChatAgentActionRecord | null>;
  /** `proposed` -> `rejected`, with the same guard. */
  reject(
    conversationId: string,
    actionId: string,
    userId: string
  ): Promise<ChatAgentActionRecord | null>;
  /** `confirmed` -> `applied` or `failed`, with what the service answered. */
  settle(
    conversationId: string,
    actionId: string,
    status: 'applied' | 'failed',
    result: Record<string, unknown>
  ): Promise<ChatAgentActionRecord>;
  insertProposal(input: {
    conversationId: string;
    messageId: string;
    tool: string;
    args: Record<string, unknown>;
  }): Promise<ChatAgentActionRecord>;
}

export function createSupabaseChatAgentActionRepository(
  supabase: SupabaseClient<Database>,
  /** The service-role client, for the one write a member may not make. */
  admin: SupabaseClient<Database> = supabase
): ChatAgentActionRepository {
  return {
    async listForMessages(messageIds) {
      if (messageIds.length === 0) return [];

      const { data, error } = await supabase
        .from('chat_agent_actions')
        .select('*')
        .in('message_id', messageIds)
        .order('created_at', { ascending: true });

      if (error) throw repositoryFailure('chat.agent.actions.list', error);
      return data.map(toRecord);
    },

    async find(conversationId, actionId) {
      const { data, error } = await supabase
        .from('chat_agent_actions')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('id', actionId)
        .maybeSingle();

      if (error) throw repositoryFailure('chat.agent.actions.find', error);
      return data ? toRecord(data) : null;
    },

    async claim(conversationId, actionId, userId) {
      const { data, error } = await supabase
        .from('chat_agent_actions')
        .update({ status: 'confirmed', resolved_by: userId, resolved_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('id', actionId)
        .eq('status', 'proposed')
        .select()
        .maybeSingle();

      if (error) throw repositoryFailure('chat.agent.actions.claim', error);
      return data ? toRecord(data) : null;
    },

    async reject(conversationId, actionId, userId) {
      const { data, error } = await supabase
        .from('chat_agent_actions')
        .update({ status: 'rejected', resolved_by: userId, resolved_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('id', actionId)
        .eq('status', 'proposed')
        .select()
        .maybeSingle();

      if (error) throw repositoryFailure('chat.agent.actions.reject', error);
      return data ? toRecord(data) : null;
    },

    async settle(conversationId, actionId, status, result) {
      const { data, error } = await supabase
        .from('chat_agent_actions')
        .update({ status, result: result as Json, resolved_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('id', actionId)
        .eq('status', 'confirmed')
        .select()
        .maybeSingle();

      if (error) throw repositoryFailure('chat.agent.actions.settle', error);
      if (!data)
        throw repositoryFailure('chat.agent.actions.settle', new Error('action not claimed'));
      return toRecord(data);
    },

    async insertProposal(input) {
      const { data, error } = await admin
        .from('chat_agent_actions')
        .insert({
          conversation_id: input.conversationId,
          message_id: input.messageId,
          tool: input.tool,
          args: input.args as Json,
          status: 'proposed',
        })
        .select()
        .single();

      if (error) throw repositoryFailure('chat.agent.actions.insert', error);
      return toRecord(data);
    },
  };
}
