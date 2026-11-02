import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import type { ChatMessageRecord } from '@/backend/repositories/chat/chat-repository';
import { repositoryFailure } from '@/backend/shared/repository-error';
import type { ChatAgentAllowance } from '@/shared/contracts/chat';

type MessageRow = Database['public']['Tables']['chat_messages']['Row'];

/** The allowance row `public.chat_agent_allowance(p_user_id)` answers. */
interface AllowanceRow {
  plan: string;
  member_used: number;
  member_cap: number;
  project_used: number;
  project_limit: number;
  resets_at: string;
}

function toMessage(row: MessageRow): ChatMessageRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderKind: row.sender_kind as ChatMessageRecord['senderKind'],
    body: row.body,
    replyToId: row.reply_to_id,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
  };
}

/**
 * The assistant's own data access.
 *
 * This is the chats surface's one service-role writer, and it is deliberately
 * narrow: it may insert an `agent` message (`sender_kind = 'agent'`,
 * `sender_id = null`) and read one aggregate allowance. The RLS insert policy on
 * `chat_messages` allows `sender_kind = 'user'` only, because a model must never
 * be able to speak with a member's identity; the thread is still *read* under
 * the caller's own session, so no service-role read path is added (#817).
 *
 * The allowance is one call because `usage_events` grants nothing to a session
 * and the project's total is a number no member's RLS can see.
 */
export interface ChatAgentRepository {
  allowance(userId: string): Promise<ChatAgentAllowance>;
  /** Writes the assistant's reply. The conversation is the caller's own thread. */
  insertAgentMessage(conversationId: string, body: string): Promise<ChatMessageRecord>;
}

export function createSupabaseChatAgentRepository(
  supabase: SupabaseClient<Database>
): ChatAgentRepository {
  return {
    async allowance(userId) {
      const { data, error } = await supabase.rpc('chat_agent_allowance', { p_user_id: userId });
      if (error) throw repositoryFailure('chat.agent.allowance', error);

      const row = (Array.isArray(data) ? data[0] : data) as AllowanceRow | null;
      if (!row) throw repositoryFailure('chat.agent.allowance', new Error('no allowance row'));

      return {
        plan: row.plan === 'pro' ? 'pro' : 'free',
        member: { used: Number(row.member_used), cap: Number(row.member_cap) },
        project: { used: Number(row.project_used), limit: Number(row.project_limit) },
        resetsAt: String(row.resets_at),
      };
    },

    async insertAgentMessage(conversationId, body) {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: null,
          sender_kind: 'agent',
          body,
        })
        .select()
        .single();

      if (error) throw repositoryFailure('chat.agent.insertAgentMessage', error);
      return toMessage(data);
    },
  };
}
