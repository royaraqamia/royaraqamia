import type { ChatSenderKind } from '@/shared/contracts/chat';

/**
 * What the Chats tab reads. One row per conversation, already carrying the
 * last line and the unread count, because `list_chat_threads()` resolves them
 * in the database (ADR-0113) instead of one query per thread.
 */
export interface ChatThreadRow {
  id: string;
  kind: string;
  title: string | null;
  status: string;
  createdAt: string;
  lastMessageAt: string | null;
  unreadCount: number;
  lastMessageBody: string | null;
  lastMessageSenderKind: ChatSenderKind | null;
  lastMessageCreatedAt: string | null;
  lastMessageHasAttachments: boolean;
  counterpartId: string | null;
  myStatus: string;
  myRole: string;
  myLastReadAt: string | null;
}

export interface ChatConversationRecord {
  id: string;
  kind: string;
  title: string | null;
  status: string;
  createdBy: string;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface ChatParticipantRecord {
  conversationId: string;
  userId: string;
  role: string;
  status: string;
  lastReadAt: string | null;
  joinedAt: string | null;
}

export interface ChatMessageRecord {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderKind: ChatSenderKind;
  body: string | null;
  replyToId: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export interface ChatAttachmentRecord {
  id: string;
  messageId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
}

export interface CreateConversationInput {
  kind: 'direct' | 'group' | 'agent';
  title?: string | null;
  createdBy: string;
  status: 'requested' | 'active';
}

export interface AddParticipantInput {
  conversationId: string;
  userId: string;
  role?: 'owner' | 'member';
  status?: 'requested' | 'invited' | 'active';
  invitedBy?: string | null;
}

export interface InsertMessageInput {
  conversationId: string;
  senderId: string | null;
  senderKind: ChatSenderKind;
  body: string | null;
  replyToId?: string | null;
  attachments?: {
    storagePath: string;
    fileName: string;
    mimeType: string;
    byteSize: number;
  }[];
}

/**
 * Data access for the chat tables. Nothing here decides a policy: the database
 * holds the rules (RLS, the derived conversation status, the block check) and
 * this interface only speaks the rows to them.
 */
export interface ChatRepository {
  listThreads(): Promise<ChatThreadRow[]>;
  findConversation(id: string): Promise<ChatConversationRecord | null>;
  findParticipants(conversationId: string): Promise<ChatParticipantRecord[]>;
  findThreadIdByDirectKey(key: string): Promise<string | null>;
  createConversation(input: CreateConversationInput): Promise<ChatConversationRecord>;
  addParticipant(input: AddParticipantInput): Promise<void>;
  setParticipantStatus(
    conversationId: string,
    userId: string,
    status: 'active' | 'declined' | 'left'
  ): Promise<void>;
  setLastRead(conversationId: string, userId: string, at: string): Promise<void>;
  findMessages(
    conversationId: string,
    before: string | null,
    limit: number
  ): Promise<ChatMessageRecord[]>;
  findMessagesByIds(ids: string[]): Promise<ChatMessageRecord[]>;
  findAttachments(messageIds: string[]): Promise<ChatAttachmentRecord[]>;
  insertMessage(input: InsertMessageInput): Promise<ChatMessageRecord>;
  updateMessageBody(id: string, userId: string, body: string): Promise<ChatMessageRecord | null>;
  tombstoneMessage(id: string, userId: string): Promise<void>;
  deleteMessageAttachments(messageId: string, userId: string): Promise<void>;
  reportConversation(
    conversationId: string,
    reason: string,
    reportedUserId: string | null
  ): Promise<string>;
  /** Closes a direct request for both sides: the requester takes it back. */
  withdrawRequest(conversationId: string): Promise<void>;
  /** Puts a closed direct thread back to `requested`; false when it was open. */
  requestThread(conversationId: string): Promise<boolean>;
  blockUser(blockerId: string, blockedId: string): Promise<void>;
  unblockUser(blockerId: string, blockedId: string): Promise<void>;
  findBlockedIds(blockerId: string): Promise<string[]>;
}

/** The pair key the database derives, so the service can look a thread up. */
export function directPairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

/**
 * Raised when the pair index refuses a second direct thread between the same
 * two people. It is an outcome, not a failure: the service answers with the
 * thread that already exists.
 */
export class DirectThreadExistsError extends Error {
  constructor() {
    super('a direct thread already exists for this pair');
    this.name = 'DirectThreadExistsError';
  }
}
