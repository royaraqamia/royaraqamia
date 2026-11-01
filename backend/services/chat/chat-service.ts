import {
  DirectThreadExistsError,
  directPairKey,
  type ChatRepository,
  type ChatMessageRecord,
} from '@/backend/repositories/chat/chat-repository';
import type { PublicUser } from '@/shared/contracts/users';
import {
  chatTitle,
  normalizeChatBody,
  type ChatAttachment,
  type ChatConversationSummary,
  type ChatMessage,
  type ChatMessagePage,
  type ChatMessageSendInput,
  type ChatPeer,
  type ChatParticipant,
  type ChatParticipantStatus,
  type ChatThread,
} from '@/shared/contracts/chat';

/**
 * A refusal the surface can act on. `status` is the HTTP status the controller
 * answers, so a policy outcome (you are not in this thread) never reads as a
 * server failure.
 */
export class ChatError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ChatError';
  }
}

export interface ChatServiceDeps {
  users: {
    getById(id: string): Promise<PublicUser | null>;
    getMany(ids: string[]): Promise<PublicUser[]>;
    search(query: string, limit: number): Promise<PublicUser[]>;
  };
  checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean>;
  /**
   * In-app notification producer (the request stage, ADR-0113). Wired to the
   * service-role producer because the `notifications` table grants INSERT to
   * `service_role` only; it never throws, so a request is never lost to a
   * delivery failure.
   */
  notify?: (input: {
    user_id: string;
    type: 'chat_request';
    title: string;
    body?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
}

const PAGE_SIZE = 30;

function toPeer(user: PublicUser | undefined): ChatPeer | null {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    avatarUrl: user.avatar_url,
    verified: user.verified,
  };
}

function toMessage(
  record: ChatMessageRecord,
  attachments: ChatAttachment[],
  replyTo: ChatMessage | null
): ChatMessage {
  return {
    id: record.id,
    conversationId: record.conversationId,
    senderId: record.senderId,
    senderKind: record.senderKind,
    body: record.body,
    replyToId: record.replyToId,
    editedAt: record.editedAt,
    deletedAt: record.deletedAt,
    createdAt: record.createdAt,
    attachments,
    replyTo,
  };
}

/**
 * Chat's business rules, on top of what the database already refuses. The
 * database owns consent, membership, blocks and the edit window; this class
 * owns what the list and the thread *say*, and the two reads that need more
 * than one table (a roster, a counterpart's public profile).
 */
export class ChatService {
  constructor(
    private readonly repo: ChatRepository,
    private readonly deps: ChatServiceDeps
  ) {}

  /** The Chats tab. */
  async listThreads(_userId: string): Promise<ChatConversationSummary[]> {
    const rows = await this.repo.listThreads();
    const peers = await this.loadPeers(
      rows.map((row) => row.counterpartId).filter((id): id is string => Boolean(id))
    );

    return rows.map((row) => {
      const counterpart = row.counterpartId ? toPeer(peers.get(row.counterpartId)) : null;
      return {
        id: row.id,
        kind: row.kind as ChatConversationSummary['kind'],
        status: row.status as ChatConversationSummary['status'],
        title: chatTitle({
          kind: row.kind as ChatConversationSummary['kind'],
          title: row.title,
          counterpart,
        }),
        counterpart,
        myStatus: row.myStatus as ChatParticipantStatus,
        lastMessage: row.lastMessageCreatedAt
          ? {
              body: row.lastMessageBody,
              senderKind: row.lastMessageSenderKind ?? 'user',
              createdAt: row.lastMessageCreatedAt,
              hasAttachments: row.lastMessageHasAttachments,
            }
          : null,
        unreadCount: row.unreadCount,
        lastMessageAt: row.lastMessageAt,
        createdAt: row.createdAt,
      };
    });
  }

  /** One thread's header, roster and the caller's own rights in it. */
  async getThread(userId: string, conversationId: string): Promise<ChatThread | null> {
    const summary = (await this.listThreads(userId)).find((thread) => thread.id === conversationId);
    if (!summary) return null;

    const [conversation, participants] = await Promise.all([
      this.repo.findConversation(conversationId),
      this.repo.findParticipants(conversationId),
    ]);
    if (!conversation) return null;

    const peers = await this.loadPeers(participants.map((participant) => participant.userId));
    const me = participants.find((participant) => participant.userId === userId);
    const counterpartId = participants.find((participant) => participant.userId !== userId)?.userId;
    const blockedByMe = counterpartId
      ? (await this.repo.findBlockedIds(userId)).includes(counterpartId)
      : false;

    const roster: ChatParticipant[] = participants.map((participant) => ({
      userId: participant.userId,
      role: participant.role === 'owner' ? 'owner' : 'member',
      status: participant.status as ChatParticipant['status'],
      lastReadAt: participant.lastReadAt,
      joinedAt: participant.joinedAt,
      peer: toPeer(peers.get(participant.userId)),
    }));

    return {
      ...summary,
      participants: roster,
      me: roster.find((participant) => participant.userId === userId) ?? null,
      blockedByMe,
      canWrite: Boolean(me?.status === 'active' && conversation.status === 'active'),
    };
  }

  /** One page of the thread, newest last, with its quotes and attachments. */
  async listMessages(
    userId: string,
    conversationId: string,
    before: string | null
  ): Promise<ChatMessagePage> {
    await this.assertMember(userId, conversationId);

    const page = await this.repo.findMessages(conversationId, before, PAGE_SIZE + 1);
    const hasMore = page.length > PAGE_SIZE;
    const records = hasMore ? page.slice(0, PAGE_SIZE) : page;

    const messages = await this.hydrate(records);
    return {
      messages: messages.reverse(),
      nextCursor: hasMore ? (records[records.length - 1]?.createdAt ?? null) : null,
    };
  }

  /**
   * A direct thread, or the one that already exists. The pair index is what
   * decides; a second attempt resolves to the first thread instead of failing,
   * because the member's intent was "open a chat with this person".
   *
   * The existing thread may be closed — declined, or withdrawn by either side.
   * Reaching it through the picker asks again on that same thread (the pair is
   * unique, so a new conversation is not available), and the other side is
   * told about the new request only when it actually reopened.
   */
  async startDirect(userId: string, peerId: string): Promise<{ conversationId: string }> {
    if (userId === peerId) {
      throw new ChatError(400, 'لا يمكنك بدء محادثة مع نفسك');
    }

    if (!(await this.deps.checkRateLimit(`chat-start:${userId}`, 20, 3600_000))) {
      throw new ChatError(429, 'تم تجاوز الحد: بدء المحادثات محدود بـ 20 محادثة في الساعة');
    }

    const peer = await this.deps.users.getById(peerId);
    if (!peer || !peer.verified) {
      throw new ChatError(404, 'العضو غير موجود');
    }

    const blocked = await this.repo.findBlockedIds(userId);
    if (blocked.includes(peerId)) {
      throw new ChatError(403, 'أزل الحظر قبل بدء المحادثة');
    }

    const existing = await this.findDirectThread(userId, peerId);
    if (existing) {
      if (await this.repo.requestThread(existing)) {
        await this.notifyRequest(userId, peerId, existing);
      }
      return { conversationId: existing };
    }

    const conversation = await this.repo.createConversation({
      kind: 'direct',
      createdBy: userId,
      status: 'requested',
    });

    await this.repo.addParticipant({
      conversationId: conversation.id,
      userId,
      role: 'owner',
      status: 'active',
    });

    try {
      await this.repo.addParticipant({
        conversationId: conversation.id,
        userId: peerId,
        status: 'requested',
        invitedBy: userId,
      });
    } catch (error) {
      if (error instanceof DirectThreadExistsError) {
        const threadId = await this.findDirectThread(userId, peerId);
        if (threadId) return { conversationId: threadId };
      }
      throw error;
    }

    await this.notifyRequest(userId, peerId, conversation.id);

    return { conversationId: conversation.id };
  }

  /** Answer a DM request or a group invite. */
  async respond(
    userId: string,
    conversationId: string,
    answer: 'accept' | 'decline'
  ): Promise<void> {
    const participants = await this.repo.findParticipants(conversationId);
    const me = participants.find((participant) => participant.userId === userId);

    if (!me || (me.status !== 'requested' && me.status !== 'invited')) {
      throw new ChatError(409, 'لا يوجد طلب بانتظارك في هذه المحادثة');
    }

    await this.repo.setParticipantStatus(
      conversationId,
      userId,
      answer === 'accept' ? 'active' : 'declined'
    );
  }

  async leave(userId: string, conversationId: string): Promise<void> {
    const participants = await this.repo.findParticipants(conversationId);
    const me = participants.find((participant) => participant.userId === userId);
    if (!me || me.status !== 'active') {
      throw new ChatError(409, 'أنت لست عضواً في هذه المحادثة');
    }

    await this.repo.setParticipantStatus(conversationId, userId, 'left');
  }

  /**
   * Take a pending request back. Both sides leave the roster, so the thread
   * disappears from the peer's inbox too rather than leaving them a request
   * nobody is waiting on; the pair can ask again through `startDirect`.
   */
  async withdraw(userId: string, conversationId: string): Promise<void> {
    const participants = await this.repo.findParticipants(conversationId);
    const me = participants.find((participant) => participant.userId === userId);
    const peer = participants.find((participant) => participant.userId !== userId);

    if (!me || me.status !== 'active') {
      throw new ChatError(403, 'لا يمكنك إلغاء طلب لم ترسله');
    }
    if (!peer || peer.status !== 'requested') {
      throw new ChatError(409, 'لم يعد هذا الطلب بانتظار رد');
    }

    await this.repo.withdrawRequest(conversationId);
  }

  /**
   * Ask again on a closed thread (declined or withdrawn). The pair is unique,
   * so this reopens the same conversation instead of opening a second one.
   */
  async reopen(userId: string, conversationId: string): Promise<void> {
    const conversation = await this.repo.findConversation(conversationId);
    if (!conversation || conversation.kind !== 'direct') {
      throw new ChatError(404, 'المحادثة غير موجودة');
    }
    if (conversation.status !== 'declined' && conversation.status !== 'archived') {
      throw new ChatError(409, 'هذه المحادثة ليست مغلقة');
    }

    const participants = await this.repo.findParticipants(conversationId);
    const peer = participants.find((participant) => participant.userId !== userId);
    if (!peer) {
      throw new ChatError(403, 'أنت لست عضواً في هذه المحادثة');
    }

    if (await this.repo.requestThread(conversationId)) {
      await this.notifyRequest(userId, peer.userId, conversationId);
    }
  }

  /** Post a line, and mark everything before it read for the writer. */
  async sendMessage(
    userId: string,
    conversationId: string,
    input: ChatMessageSendInput
  ): Promise<ChatMessage> {
    if (!(await this.deps.checkRateLimit(`chat-send:${userId}`, 120, 60_000))) {
      throw new ChatError(429, 'تم تجاوز الحد: الرسائل محدودة بـ 120 رسالة في الدقيقة');
    }

    const body = input.body ? normalizeChatBody(input.body) : null;
    if (!body && (input.attachments?.length ?? 0) === 0) {
      throw new ChatError(400, 'اكتب رسالة أو أرفق ملفاً');
    }

    const record = await this.repo.insertMessage({
      conversationId,
      senderId: userId,
      senderKind: 'user',
      body,
      replyToId: input.replyToId ?? null,
      attachments: input.attachments,
    });

    await this.repo.setLastRead(conversationId, userId, new Date().toISOString());

    const [message] = await this.hydrate([record]);
    if (!message) throw new ChatError(500, 'تعذّر إرسال الرسالة');
    return message;
  }

  async editMessage(userId: string, messageId: string, body: string): Promise<ChatMessage> {
    const record = await this.repo.updateMessageBody(messageId, userId, normalizeChatBody(body));
    if (!record) {
      throw new ChatError(403, 'لا يمكن تعديل هذه الرسالة');
    }

    const [message] = await this.hydrate([record]);
    if (!message) throw new ChatError(500, 'تعذّر تعديل الرسالة');
    return message;
  }

  /** A tombstone, not a delete: the thread keeps its shape. */
  async deleteMessage(userId: string, messageId: string): Promise<void> {
    await this.repo.tombstoneMessage(messageId, userId);
  }

  async markRead(userId: string, conversationId: string, at?: string): Promise<void> {
    await this.repo.setLastRead(conversationId, userId, at ?? new Date().toISOString());
  }

  async report(
    conversationId: string,
    reason: string,
    reportedUserId: string | null
  ): Promise<string> {
    return this.repo.reportConversation(conversationId, reason, reportedUserId);
  }

  async block(userId: string, blockedId: string): Promise<void> {
    if (userId === blockedId) throw new ChatError(400, 'لا يمكنك حظر نفسك');
    await this.repo.blockUser(userId, blockedId);
  }

  async unblock(userId: string, blockedId: string): Promise<void> {
    await this.repo.unblockUser(userId, blockedId);
  }

  /** Who the caller has blocked, with the directory's public face attached. */
  async listBlocked(userId: string): Promise<ChatPeer[]> {
    const ids = await this.repo.findBlockedIds(userId);
    if (ids.length === 0) return [];

    const users = await this.deps.users.getMany(ids);
    const byId = new Map(users.map((user) => [user.id, user]));
    return ids.flatMap((id) => {
      const peer = toPeer(byId.get(id));
      return peer ? [peer] : [];
    });
  }

  /**
   * Tell the other side a request is waiting. The producer is fail-safe: a
   * refused or failed notification never undoes the request itself.
   */
  private async notifyRequest(
    fromUserId: string,
    toUserId: string,
    conversationId: string
  ): Promise<void> {
    if (!this.deps.notify) return;

    const me = await this.deps.users.getById(fromUserId);
    const label = me?.name?.trim() || (me ? `@${me.username}` : 'عضو');

    await this.deps.notify({
      user_id: toUserId,
      type: 'chat_request',
      title: 'طلب محادثة',
      body: `${label} يريد بدء محادثة معك`,
      metadata: { conversationId },
    });
  }

  /**
   * Who you can start a thread with: verified members matching the term. The
   * caller never sees email or a private column — `PublicUser` is the
   * directory's own projection (ADR-0088).
   */
  async searchMembers(userId: string, query: string): Promise<ChatPeer[]> {
    const term = query.trim();
    if (term.length < 2) return [];

    if (!(await this.deps.checkRateLimit(`chat-search:${userId}`, 30, 60_000))) {
      throw new ChatError(429, 'تم تجاوز الحد: البحث محدود بـ 30 استعلاماً في الدقيقة');
    }

    const members = await this.deps.users.search(term, 10);
    return members
      .filter((member) => member.id !== userId)
      .map((member) => ({
        id: member.id,
        username: member.username,
        name: member.name,
        avatarUrl: member.avatar_url,
        verified: member.verified,
      }));
  }

  private async assertMember(userId: string, conversationId: string): Promise<void> {
    const participants = await this.repo.findParticipants(conversationId);
    const me = participants.find((participant) => participant.userId === userId);
    if (!me || me.status !== 'active') {
      throw new ChatError(403, 'أنت لست عضواً في هذه المحادثة');
    }
  }

  private async findDirectThread(userId: string, peerId: string): Promise<string | null> {
    return this.repo.findThreadIdByDirectKey(directPairKey(userId, peerId));
  }

  private async loadPeers(ids: string[]): Promise<Map<string, PublicUser>> {
    const users = await this.deps.users.getMany(ids);
    return new Map(users.map((user) => [user.id, user]));
  }

  /** Attaches and quotes for a page, in two reads rather than two per row. */
  private async hydrate(records: ChatMessageRecord[]): Promise<ChatMessage[]> {
    if (records.length === 0) return [];

    const attachmentRecords = await this.repo.findAttachments(records.map((record) => record.id));
    const attachmentsByMessage = new Map<string, ChatAttachment[]>();
    for (const attachment of attachmentRecords) {
      const list = attachmentsByMessage.get(attachment.messageId) ?? [];
      list.push({
        id: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        byteSize: attachment.byteSize,
      });
      attachmentsByMessage.set(attachment.messageId, list);
    }

    const replyIds = [
      ...new Set(
        records.map((record) => record.replyToId).filter((id): id is string => Boolean(id))
      ),
    ];
    const quoted = await this.repo.findMessagesByIds(replyIds);
    const quotes = new Map(quoted.map((record) => [record.id, record]));

    return records.map((record) => {
      const quote = record.replyToId ? quotes.get(record.replyToId) : undefined;
      return toMessage(
        record,
        attachmentsByMessage.get(record.id) ?? [],
        quote ? toMessage(quote, [], null) : null
      );
    });
  }
}
