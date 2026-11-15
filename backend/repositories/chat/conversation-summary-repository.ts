import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { repositoryFailure } from '@/backend/shared/repository-error';
import {
  SUMMARY_INPUT_MAX_MESSAGES,
  type ConversationSummary,
  type SummaryMessage,
} from '@/backend/shared/domain/conversation-summary';

/**
 * The conversation's summary, read and written (ADR-0182 decision 4, #1512).
 *
 * Two factories and two clients, on purpose, exactly like the fact store
 * (`backend/config/agent-memory.ts`, #1509). The **read** is the member's own
 * session: the summary lives on their conversation row, so the policy that
 * already answers "which threads may I read" is the boundary and no new policy
 * is needed. The **writes and the message read behind them** are the service
 * role's, because a regeneration is background work with no member session and
 * the member holds no `update` grant on `chat_conversations` on purpose.
 *
 * What keeps the second half from being a way to read somebody else's thread is
 * the same thing extraction relies on: the conversation id comes from a turn
 * this server is already running for that member, never from a request.
 */
export interface ConversationSummaryReader {
  /** The conversation's summary, or `null` when it has none. */
  find(conversationId: string): Promise<ConversationSummary | null>;
}

/** How much of the thread a regeneration still has to read. */
export interface SummaryProgress {
  /** Live messages the thread holds: "has it passed the window at all". */
  total: number;
  /** Live messages after the cursor: "is another regeneration worth its call". */
  unseen: number;
}

export interface ConversationSummaryWriter extends ConversationSummaryReader {
  progress(conversationId: string, cursor: string | null): Promise<SummaryProgress>;
  /**
   * The messages after the cursor, oldest first and capped. Oldest first is
   * what keeps a long thread contiguous: the cursor can only move forward to
   * the last message actually read, so no regeneration leaves a hole.
   */
  unseen(conversationId: string, cursor: string | null): Promise<SummaryMessage[]>;
  /**
   * Stores the text and the cursor together, only if the cursor is still the
   * one this regeneration read from. False means another regeneration moved it
   * first, and this one's text describes an older part of the thread: dropping
   * it is what stops a stale write from overwriting a newer summary.
   */
  save(input: {
    conversationId: string;
    text: string;
    through: string;
    /** The cursor this regeneration read from; `null` for the first one. */
    previous: string | null;
    at: string;
  }): Promise<boolean>;
}

type MessageRow = Database['public']['Tables']['chat_messages']['Row'];

function toSummary(row: {
  summary: string | null;
  summary_through_message_id: string | null;
  summary_updated_at: string | null;
}): ConversationSummary | null {
  const text = row.summary?.trim() ?? '';
  if (!text) return null;
  return {
    text,
    throughMessageId: row.summary_through_message_id,
    updatedAt: row.summary_updated_at ?? '',
  };
}

function toMessage(row: MessageRow): SummaryMessage | null {
  const body = row.body?.trim() ?? '';
  if (!body || row.deleted_at !== null) return null;
  return {
    id: row.id,
    senderKind: row.sender_kind as SummaryMessage['senderKind'],
    body,
    createdAt: row.created_at,
  };
}

const SUMMARY_COLUMNS = 'summary, summary_through_message_id, summary_updated_at';

export function createSupabaseConversationSummaryReader(
  supabase: SupabaseClient<Database>
): ConversationSummaryReader {
  return {
    async find(conversationId) {
      const { data, error } = await supabase
        .from('chat_conversations')
        .select(SUMMARY_COLUMNS)
        .eq('id', conversationId)
        .maybeSingle();

      if (error) throw repositoryFailure('chat.conversationSummary.find', error);
      return data ? toSummary(data) : null;
    },
  };
}

export function createSupabaseConversationSummaryWriter(
  supabase: SupabaseClient<Database>
): ConversationSummaryWriter {
  async function count(conversationId: string, after: string | null): Promise<number> {
    // A tombstone is not context and an empty body is nothing to summarise —
    // the same rule `trimHistory` applies to the window, so the count and the
    // read agree with the prompt about what the thread is made of.
    let query = supabase
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .is('deleted_at', null);
    if (after) query = query.gt('created_at', after);

    const { count: rows, error } = await query;
    if (error) throw repositoryFailure('chat.conversationSummary.count', error);
    return rows ?? 0;
  }

  return {
    async find(conversationId) {
      const { data, error } = await supabase
        .from('chat_conversations')
        .select(SUMMARY_COLUMNS)
        .eq('id', conversationId)
        .maybeSingle();

      if (error) throw repositoryFailure('chat.conversationSummary.find', error);
      return data ? toSummary(data) : null;
    },

    async progress(conversationId, cursor) {
      const total = await count(conversationId, null);
      if (!cursor) return { total, unseen: total };

      const { data: anchor, error } = await supabase
        .from('chat_messages')
        .select('created_at')
        .eq('id', cursor)
        .maybeSingle();

      if (error) throw repositoryFailure('chat.conversationSummary.cursor', error);
      // A cursor whose row is gone (a hard delete, rather than the tombstone the
      // thread uses) has seen nothing it can point at: the next regeneration
      // starts from the beginning rather than claiming a middle.
      if (!anchor) return { total, unseen: total };

      return { total, unseen: await count(conversationId, anchor.created_at) };
    },

    async unseen(conversationId, cursor) {
      let after: string | null = null;
      if (cursor) {
        const { data: anchor, error } = await supabase
          .from('chat_messages')
          .select('created_at')
          .eq('id', cursor)
          .maybeSingle();
        if (error) throw repositoryFailure('chat.conversationSummary.cursor', error);
        after = anchor?.created_at ?? null;
      }

      let query = supabase
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(SUMMARY_INPUT_MAX_MESSAGES);
      if (after) query = query.gt('created_at', after);

      const { data, error } = await query;
      if (error) throw repositoryFailure('chat.conversationSummary.unseen', error);
      return (data ?? [])
        .map(toMessage)
        .filter((message): message is SummaryMessage => message !== null);
    },

    async save({ conversationId, text, through, previous, at }) {
      let query = supabase
        .from('chat_conversations')
        .update({
          summary: text,
          summary_through_message_id: through,
          summary_updated_at: at,
        })
        .eq('id', conversationId);

      // The compare-and-swap: only the writer that read this cursor may move it.
      query = previous
        ? query.eq('summary_through_message_id', previous)
        : query.is('summary_through_message_id', null);

      const { data, error } = await query.select('id');
      if (error) throw repositoryFailure('chat.conversationSummary.save', error);
      return (data?.length ?? 0) > 0;
    },
  };
}
