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
  /** The writer's own id for the line (#1033); null for one the server named. */
  clientId: string | null;
}

export interface ChatAttachmentRecord {
  id: string;
  messageId: string;
  uploaderId: string;
  storagePath: string;
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
  /**
   * The id the writer minted for this line (#1033). Present makes the insert a
   * replay-safe write: a second insert with the same `(senderId, clientId)`
   * answers the first row instead of creating one.
   */
  clientId?: string | null;
  attachments?: {
    storagePath: string;
    fileName: string;
    mimeType: string;
    byteSize: number;
  }[];
}

/**
 * A message is written before its attachment rows, so a refusal in that second
 * write cannot roll the first one back. The repository reports it instead of
 * throwing: the service decides what the thread should show (a tombstone) and
 * which sentence the composer answers with.
 */
export interface InsertMessageResult {
  record: ChatMessageRecord;
  /** `null` when the message carried no files, or they all landed. */
  attachmentFailure: { code: string | null; message: string | null } | null;
}

/** The server's attachment allowances, as the composer reads them. */
export interface ChatAttachmentAllowanceRecord {
  fileBytes: number;
  todayUsedBytes: number;
  todayLimitBytes: number;
  totalUsedBytes: number;
  totalLimitBytes: number;
  projectUsedBytes: number;
  projectLimitBytes: number;
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
  /**
   * The other side of a direct thread, as an id and nothing else (#888). The
   * roster policy hides a peer's row from a member who left, so a reopen that
   * asked `findParticipants` for it answered with the caller's row alone.
   */
  findDirectPeer(conversationId: string): Promise<string | null>;
  findThreadIdByDirectKey(key: string): Promise<string | null>;
  /**
   * The member's assistant thread, read by creator rather than through the
   * roster (#890). A create that loses the one-thread race may find the winner's
   * conversation before its participant row exists, and `listThreads` joins the
   * roster — so that thread would otherwise be invisible.
   */
  findAgentThreadId(userId: string): Promise<string | null>;
  createConversation(input: CreateConversationInput): Promise<ChatConversationRecord>;
  addParticipant(input: AddParticipantInput): Promise<void>;
  /**
   * The owner's own roster row, written only when it is missing (#890). A
   * second insert would trip the primary key, so the row that already exists is
   * an outcome, not a conflict.
   */
  ensureOwnerParticipant(conversationId: string, userId: string): Promise<void>;
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
  /**
   * One attachment of a thread, read through the caller's own RLS, so a
   * non-member's id finds nothing. `null` is "not yours to see", never "broken".
   */
  findAttachmentInConversation(
    conversationId: string,
    attachmentId: string
  ): Promise<ChatAttachmentRecord | null>;
  /** The caller's attachment allowances: the file cap, the day, the totals. */
  attachmentAllowance(): Promise<ChatAttachmentAllowanceRecord>;
  insertMessage(input: InsertMessageInput): Promise<InsertMessageResult>;
  updateMessageBody(id: string, userId: string, body: string): Promise<ChatMessageRecord | null>;
  /** False when no row changed: a refusal, or a message already tombstoned. */
  tombstoneMessage(id: string, userId: string): Promise<boolean>;
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
