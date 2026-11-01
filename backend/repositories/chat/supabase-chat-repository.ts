import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import {
  DirectThreadExistsError,
  type AddParticipantInput,
  type ChatAttachmentRecord,
  type ChatConversationRecord,
  type ChatMessageRecord,
  type ChatParticipantRecord,
  type ChatRepository,
  type ChatThreadRow,
  type CreateConversationInput,
  type InsertMessageInput,
} from '@/backend/repositories/chat/chat-repository';
import { isNotFoundError, repositoryFailure } from '@/backend/shared/repository-error';

type ConversationRow = Database['public']['Tables']['chat_conversations']['Row'];
type ParticipantRow = Database['public']['Tables']['chat_participants']['Row'];
type MessageRow = Database['public']['Tables']['chat_messages']['Row'];
type AttachmentRow = Database['public']['Tables']['chat_attachments']['Row'];

/** Postgres' unique_violation: the second direct thread between two people. */
const UNIQUE_VIOLATION = '23505';

function causeCode(error: unknown): string | null {
  const cause = (error as { cause?: unknown } | null)?.cause;
  if (typeof cause === 'object' && cause !== null && 'code' in cause) {
    return String((cause as { code: unknown }).code);
  }
  return null;
}

/** Whatever PostgREST said, in the one shape the service maps to a message. */
function underlyingCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String((error as { code: unknown }).code);
  }
  return causeCode(error);
}

function toConversation(row: ConversationRow): ChatConversationRecord {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    status: row.status,
    createdBy: row.created_by,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
  };
}

function toParticipant(row: ParticipantRow): ChatParticipantRecord {
  return {
    conversationId: row.conversation_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    lastReadAt: row.last_read_at,
    joinedAt: row.joined_at,
  };
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

function toAttachment(row: AttachmentRow): ChatAttachmentRecord {
  return {
    id: row.id,
    messageId: row.message_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
  };
}

/**
 * The chat tables for one signed-in caller. Every query runs on the session's
 * own client, so RLS — not this file — decides which rows exist for it.
 */
export function createSupabaseChatRepository(supabase: SupabaseClient<Database>): ChatRepository {
  return {
    async listThreads() {
      const { data, error } = await supabase.rpc('list_chat_threads');
      if (error) throw repositoryFailure('chat.listThreads', error);

      return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        kind: String(row.kind),
        title: (row.title as string | null) ?? null,
        status: String(row.status),
        createdAt: String(row.created_at),
        lastMessageAt: (row.last_message_at as string | null) ?? null,
        unreadCount: Number(row.unread_count ?? 0),
        lastMessageBody: (row.last_message_body as string | null) ?? null,
        lastMessageSenderKind:
          (row.last_message_sender_kind as ChatThreadRow['lastMessageSenderKind']) ?? null,
        lastMessageCreatedAt: (row.last_message_created_at as string | null) ?? null,
        lastMessageHasAttachments: Boolean(row.last_message_has_attachments),
        counterpartId: (row.counterpart_id as string | null) ?? null,
        myStatus: String(row.my_status),
        myRole: String(row.my_role),
        myLastReadAt: (row.my_last_read_at as string | null) ?? null,
      }));
    },

    async findConversation(id) {
      const { data, error } = await supabase
        .from('chat_conversations')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error && !isNotFoundError(error)) {
        throw repositoryFailure('chat.findConversation', error);
      }
      return data ? toConversation(data) : null;
    },

    async findParticipants(conversationId) {
      const { data, error } = await supabase
        .from('chat_participants')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw repositoryFailure('chat.findParticipants', error);
      return (data ?? []).map(toParticipant);
    },

    async findThreadIdByDirectKey(key) {
      const { data, error } = await supabase
        .from('chat_conversations')
        .select('id')
        .eq('direct_key', key)
        .maybeSingle();

      if (error && !isNotFoundError(error)) {
        throw repositoryFailure('chat.findThreadIdByDirectKey', error);
      }
      return data?.id ?? null;
    },

    async createConversation(input: CreateConversationInput) {
      const { data, error } = await supabase
        .from('chat_conversations')
        .insert({
          kind: input.kind,
          title: input.title ?? null,
          created_by: input.createdBy,
          status: input.status,
        })
        .select()
        .single();

      if (error) throw repositoryFailure('chat.createConversation', error);
      return toConversation(data);
    },

    async addParticipant(input: AddParticipantInput) {
      const { error } = await supabase.from('chat_participants').insert({
        conversation_id: input.conversationId,
        user_id: input.userId,
        role: input.role ?? 'member',
        status: input.status ?? 'active',
        invited_by: input.invitedBy ?? null,
        joined_at: (input.status ?? 'active') === 'active' ? new Date().toISOString() : null,
      });

      if (error) {
        // The second direct thread between two people trips the pair index;
        // that is an outcome the service answers with the existing thread.
        if (underlyingCode(error) === UNIQUE_VIOLATION) throw new DirectThreadExistsError();
        throw repositoryFailure('chat.addParticipant', error);
      }
    },

    async setParticipantStatus(conversationId, userId, status) {
      const { error } = await supabase
        .from('chat_participants')
        .update({
          status,
          joined_at: status === 'active' ? new Date().toISOString() : null,
        })
        .eq('conversation_id', conversationId)
        .eq('user_id', userId);

      if (error) throw repositoryFailure('chat.setParticipantStatus', error);
    },

    async setLastRead(conversationId, userId, at) {
      const { error } = await supabase
        .from('chat_participants')
        .update({ last_read_at: at })
        .eq('conversation_id', conversationId)
        .eq('user_id', userId);

      if (error) throw repositoryFailure('chat.setLastRead', error);
    },

    async findMessages(conversationId, before, limit) {
      let query = supabase
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (before) query = query.lt('created_at', before);

      const { data, error } = await query;
      if (error) throw repositoryFailure('chat.findMessages', error);
      return (data ?? []).map(toMessage);
    },

    async findMessagesByIds(ids) {
      if (ids.length === 0) return [];
      const { data, error } = await supabase.from('chat_messages').select('*').in('id', ids);
      if (error) throw repositoryFailure('chat.findMessagesByIds', error);
      return (data ?? []).map(toMessage);
    },

    async findAttachments(messageIds) {
      if (messageIds.length === 0) return [];
      const { data, error } = await supabase
        .from('chat_attachments')
        .select('*')
        .in('message_id', messageIds);

      if (error) throw repositoryFailure('chat.findAttachments', error);
      return (data ?? []).map(toAttachment);
    },

    async insertMessage(input: InsertMessageInput) {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id: input.conversationId,
          sender_id: input.senderId,
          sender_kind: input.senderKind,
          body: input.body,
          reply_to_id: input.replyToId ?? null,
        })
        .select()
        .single();

      if (error) throw repositoryFailure('chat.insertMessage', error);

      const attachments = input.attachments ?? [];
      if (attachments.length > 0 && input.senderId) {
        const { error: attachError } = await supabase.from('chat_attachments').insert(
          attachments.map((attachment) => ({
            message_id: data.id,
            uploader_id: input.senderId as string,
            storage_path: attachment.storagePath,
            file_name: attachment.fileName,
            mime_type: attachment.mimeType,
            byte_size: attachment.byteSize,
          }))
        );

        if (attachError) throw repositoryFailure('chat.insertAttachments', attachError);
      }

      return toMessage(data);
    },

    async updateMessageBody(id, userId, body) {
      const { data, error } = await supabase
        .from('chat_messages')
        .update({ body })
        .eq('id', id)
        .eq('sender_id', userId)
        .select()
        .maybeSingle();

      if (error && !isNotFoundError(error)) {
        throw repositoryFailure('chat.updateMessageBody', error);
      }
      return data ? toMessage(data) : null;
    },

    async tombstoneMessage(id, userId) {
      const { error } = await supabase
        .from('chat_messages')
        .update({ deleted_at: new Date().toISOString(), body: null })
        .eq('id', id)
        .eq('sender_id', userId);

      if (error) throw repositoryFailure('chat.tombstoneMessage', error);
    },

    async deleteMessageAttachments(messageId, userId) {
      const { error } = await supabase
        .from('chat_attachments')
        .delete()
        .eq('message_id', messageId)
        .eq('uploader_id', userId);

      if (error) throw repositoryFailure('chat.deleteMessageAttachments', error);
    },

    async reportConversation(conversationId, reason, reportedUserId) {
      const { data, error } = await supabase.rpc('report_chat_conversation', {
        p_conversation_id: conversationId,
        p_reason: reason,
        p_reported_user_id: reportedUserId,
      });

      if (error) throw repositoryFailure('chat.reportConversation', error);
      return String(data);
    },

    async withdrawRequest(conversationId) {
      const { error } = await supabase.rpc('withdraw_chat_request', {
        p_conversation_id: conversationId,
      });

      if (error) throw repositoryFailure('chat.withdrawRequest', error);
    },

    async requestThread(conversationId) {
      const { data, error } = await supabase.rpc('request_chat_conversation', {
        p_conversation_id: conversationId,
      });

      if (error) throw repositoryFailure('chat.requestThread', error);
      return data === true;
    },

    async blockUser(blockerId, blockedId) {
      const { error } = await supabase
        .from('chat_blocks')
        .insert({ blocker_id: blockerId, blocked_id: blockedId });

      // Re-blocking is idempotent from the member's point of view.
      if (error && underlyingCode(error) !== UNIQUE_VIOLATION) {
        throw repositoryFailure('chat.blockUser', error);
      }
    },

    async unblockUser(blockerId, blockedId) {
      const { error } = await supabase
        .from('chat_blocks')
        .delete()
        .eq('blocker_id', blockerId)
        .eq('blocked_id', blockedId);

      if (error) throw repositoryFailure('chat.unblockUser', error);
    },

    async findBlockedIds(blockerId) {
      const { data, error } = await supabase
        .from('chat_blocks')
        .select('blocked_id')
        .eq('blocker_id', blockerId);

      if (error) throw repositoryFailure('chat.findBlockedIds', error);
      return (data ?? []).map((row) => row.blocked_id);
    },
  };
}
