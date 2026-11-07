import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import type { ChatMessageRecord } from '@/backend/repositories/chat/chat-repository';
import { repositoryFailure } from '@/backend/shared/repository-error';
import type { ChatAgentAllowance } from '@/shared/contracts/chat';

type MessageRow = Database['public']['Tables']['chat_messages']['Row'];
type TurnRow = Database['public']['Tables']['agent_turns']['Row'];

/** What a worker needs to finish a turn: who asked, in which thread, and what. */
export interface AgentTurnRow {
  id: string;
  conversationId: string;
  memberId: string;
  question: string;
  resumes: number;
}

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
    clientId: row.client_id,
  };
}

function toTurn(row: TurnRow): AgentTurnRow {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    memberId: row.member_id,
    question: row.question ?? '',
    resumes: row.resumes,
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
 *
 * `agent_turns` is the record that outlives the request: the attempt count, the
 * text that had already streamed when a turn failed, and how it ended. No
 * session is written there — a server-side copy of a member's session would
 * rotate the browser's refresh token out from under them (`docs/security.md`).
 */
export interface ChatAgentRepository {
  allowance(userId: string): Promise<ChatAgentAllowance>;
  /** Writes the assistant's reply. The conversation is the caller's own thread. */
  insertAgentMessage(conversationId: string, body: string): Promise<ChatMessageRecord>;
  /** Opens the record of one turn and answers its id. */
  startTurn(conversationId: string, memberId: string, question: string): Promise<string>;
  /** The words a voice note turned out to hold, written once it is transcribed. */
  setTurnQuestion(turnId: string, question: string): Promise<void>;
  /** Counts a retry the turn is about to take. */
  recordAttempt(turnId: string, attempts: number): Promise<void>;
  /** The answer landed. */
  settleTurn(turnId: string): Promise<void>;
  /** The turn ended without an answer; what streamed and why are kept. */
  failTurn(turnId: string, failure: { error: string; partialText: string }): Promise<void>;
  /** Turns whose request is gone, oldest first. */
  dueTurns(limit: number): Promise<string[]>;
  /** The lease: null when another worker won the turn, or it is not abandoned. */
  claimTurn(turnId: string): Promise<AgentTurnRow | null>;
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

    async startTurn(conversationId, memberId, question) {
      const { data, error } = await supabase
        .from('agent_turns')
        .insert({ conversation_id: conversationId, member_id: memberId, question })
        .select('id')
        .single();

      if (error) throw repositoryFailure('chat.agent.startTurn', error);
      return data.id;
    },

    async setTurnQuestion(turnId, question) {
      const { error } = await supabase.from('agent_turns').update({ question }).eq('id', turnId);

      if (error) throw repositoryFailure('chat.agent.setTurnQuestion', error);
    },

    async dueTurns(limit) {
      const { data, error } = await supabase.rpc('agent_turns_due', { p_limit: limit });
      if (error) throw repositoryFailure('chat.agent.dueTurns', error);
      return (data ?? []).map((row) => row.id);
    },

    async claimTurn(turnId) {
      const { data, error } = await supabase.rpc('claim_agent_turn', { p_turn_id: turnId });
      if (error) throw repositoryFailure('chat.agent.claimTurn', error);

      const row = (Array.isArray(data) ? data[0] : null) as TurnRow | null;
      return row ? toTurn(row) : null;
    },

    async recordAttempt(turnId, attempts) {
      const { error } = await supabase.from('agent_turns').update({ attempts }).eq('id', turnId);

      if (error) throw repositoryFailure('chat.agent.recordAttempt', error);
    },

    async settleTurn(turnId) {
      const { error } = await supabase
        .from('agent_turns')
        .update({
          state: 'settled',
          settled_at: new Date().toISOString(),
          partial_text: null,
          error: null,
        })
        .eq('id', turnId);

      if (error) throw repositoryFailure('chat.agent.settleTurn', error);
    },

    async failTurn(turnId, { error: reason, partialText }) {
      const { error } = await supabase
        .from('agent_turns')
        .update({
          state: 'failed',
          settled_at: new Date().toISOString(),
          error: reason.slice(0, 500),
          partial_text: partialText.trim() ? partialText.slice(0, 20_000) : null,
        })
        .eq('id', turnId);

      if (error) throw repositoryFailure('chat.agent.failTurn', error);
    },
  };
}
