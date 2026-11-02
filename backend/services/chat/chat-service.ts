import {
  ChatThreadFullError,
  DirectThreadExistsError,
  directPairKey,
  type ChatRepository,
  type ChatMessageRecord,
} from '@/backend/repositories/chat/chat-repository';
import type { ChatAttachmentStorage } from '@/backend/repositories/chat/chat-attachment-storage';
import type { PublicUser } from '@/shared/contracts/users';
import {
  chatAttachmentIsInlineImage,
  chatTitle,
  normalizeChatBody,
  type ChatAttachment,
  type ChatAttachmentQuota,
  type ChatConversationSummary,
  type ChatMessage,
  type ChatMessagePage,
  type ChatMessageSendInput,
  type ChatPeer,
  type ChatParticipant,
  type ChatParticipantStatus,
  type ChatPreview,
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
    getByUsername(username: string): Promise<PublicUser | null>;
    getMany(ids: string[]): Promise<PublicUser[]>;
    search(query: string, limit: number): Promise<PublicUser[]>;
  };
  checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean>;
  /** The bucket the attachments live in: signing and removal only. */
  attachments: ChatAttachmentStorage;
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

/** The database's quota refusal, and a policy refusal, as sentences. */
const QUOTA_EXCEEDED_CODE = '53400';
const POLICY_REFUSAL_CODE = '42501';

/**
 * The four attachment caps answer four different sentences, keyed by the text
 * the trigger raised. A member needs to know whether to pick a smaller file, wait
 * for tomorrow, delete an old message, or try again later.
 */
const ATTACHMENT_REFUSALS: Record<string, { status: number; sentence: string }> = {
  'chat attachment file is too large': {
    status: 413,
    sentence: 'حجم الملف يتجاوز الحد المسموح',
  },
  'chat attachment daily allowance reached': {
    status: 429,
    sentence: 'بلغت حدّ المرفقات اليوم، يعود غداً',
  },
  'chat attachment storage is full': {
    status: 409,
    sentence: 'مساحة مرفقاتك ممتلئة، احذف رسالة قديمة فيها ملفات',
  },
  'chat attachment project storage is full': {
    status: 409,
    sentence: 'مساحة مرفقات الموقع ممتلئة، حاول لاحقاً',
  },
};

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

    return (
      rows
        // A declined group invite is not a thread the member can enter: the room
        // stays open for everyone else, and this side never agreed to be in it,
        // so leaving the row in the list would be a dead entry that never closes.
        .filter((row) => !(row.kind === 'group' && row.myStatus === 'declined'))
        .map((row) => {
          // A group is named by its title, so its "counterpart" — whichever
          // member the list read happened to order first — is nobody's face.
          const counterpart =
            row.kind === 'direct' && row.counterpartId
              ? toPeer(peers.get(row.counterpartId))
              : null;

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
        })
    );
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
    // A block is a fact between two people. In a group the block still refuses
    // posting (the database's `chat_can_write` checks every peer), but it does
    // not close the thread, so the surface is not told it did.
    const counterpartId =
      conversation.kind === 'direct'
        ? participants.find((participant) => participant.userId !== userId)?.userId
        : undefined;
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
      attachmentQuota: await this.attachmentQuota(),
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

  /**
   * A named group: the creator is `owner` and active at once (the database opens
   * a group on its creator, not on consent from everyone else), and everyone
   * else is `invited` until they answer.
   *
   * The plan cap is the controller's pre-check with the upgrade nudge; the
   * trigger on `chat_conversations` is the enforcement, so this method does not
   * count anything. It does own the two rules the database cannot state: only
   * verified members are invited, and the creator is not one of them.
   */
  async startGroup(
    userId: string,
    input: { title: string; memberIds: string[] }
  ): Promise<{ conversationId: string }> {
    const memberIds = this.invitableIds(userId, input.memberIds);
    if (memberIds.length === 0) {
      throw new ChatError(400, 'أضف عضواً واحداً على الأقل');
    }

    if (!(await this.deps.checkRateLimit(`chat-start:${userId}`, 20, 3600_000))) {
      throw new ChatError(429, 'تم تجاوز الحد: بدء المحادثات محدود بـ 20 محادثة في الساعة');
    }

    await this.assertVerified(memberIds);

    const conversation = await this.repo.createConversation({
      kind: 'group',
      title: input.title,
      createdBy: userId,
      // A group is open while someone is in it; the invited rows join at their
      // own pace and the roster is what says so.
      status: 'active',
    });

    await this.repo.addParticipant({
      conversationId: conversation.id,
      userId,
      role: 'owner',
      status: 'active',
    });

    await this.inviteMembers(userId, conversation.id, input.title, memberIds);

    return { conversationId: conversation.id };
  }

  /**
   * Invite more members into a group the caller is active in. The roster is the
   * database's rule (`private.chat_may_add_participant`); this composes the
   * read the surface needs and names the one refusal that is a state — a full
   * room.
   *
   * Someone already in the roster is skipped rather than retried: an invite is
   * idempotent from the inviter's point of view, and the insert would answer a
   * unique violation that means "they are already here".
   */
  async addMembers(
    userId: string,
    conversationId: string,
    memberIds: string[]
  ): Promise<{ added: number }> {
    const conversation = await this.repo.findConversation(conversationId);
    if (!conversation || conversation.kind !== 'group') {
      throw new ChatError(404, 'المحادثة غير موجودة');
    }

    const participants = await this.repo.findParticipants(conversationId);
    const me = participants.find((participant) => participant.userId === userId);
    if (me?.status !== 'active') {
      throw new ChatError(403, 'أنت لست عضواً في هذه المحادثة');
    }

    const present = new Set(participants.map((participant) => participant.userId));
    const targets = this.invitableIds(userId, memberIds).filter((id) => !present.has(id));
    if (targets.length === 0) {
      throw new ChatError(409, 'هؤلاء الأعضاء في المجموعة بالفعل');
    }

    if (!(await this.deps.checkRateLimit(`chat-invite:${userId}`, 60, 3600_000))) {
      throw new ChatError(429, 'تم تجاوز الحد: الدعوات محدودة بـ 60 دعوة في الساعة');
    }

    await this.assertVerified(targets);
    return {
      added: await this.inviteMembers(
        userId,
        conversationId,
        conversation.title ?? 'مجموعة',
        targets
      ),
    };
  }

  /** Answer a DM request or a group invite. */ async respond(
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

  /**
   * Leaving is a group exit. A direct thread is the pair, not a room: its exits
   * are decline or withdraw before acceptance and block after it, so a one-sided
   * `left` would strand the peer with a thread nobody can read and the leaver
   * with one they cannot reopen (#842). Read the kind before writing anything.
   */
  async leave(userId: string, conversationId: string): Promise<void> {
    const participants = await this.repo.findParticipants(conversationId);
    const me = participants.find((participant) => participant.userId === userId);
    if (!me || me.status !== 'active') {
      throw new ChatError(409, 'أنت لست عضواً في هذه المحادثة');
    }

    const conversation = await this.repo.findConversation(conversationId);
    if (conversation?.kind !== 'group') {
      throw new ChatError(409, 'لا يمكن مغادرة محادثة مباشرة');
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

    const result = await this.repo.insertMessage({
      conversationId,
      senderId: userId,
      senderKind: 'user',
      body,
      replyToId: input.replyToId ?? null,
      attachments: input.attachments,
    });

    if (result.attachmentFailure) {
      // The message is already a row. A bubble that claims files it does not
      // have is worse than a tombstone, so the failed send leaves the tombstone
      // the thread can explain and the composer shows the sentence (#815).
      await this.repo.tombstoneMessage(result.record.id, userId);

      if (result.attachmentFailure.code === QUOTA_EXCEEDED_CODE) {
        const refusal = ATTACHMENT_REFUSALS[result.attachmentFailure.message ?? ''];
        throw refusal
          ? new ChatError(refusal.status, refusal.sentence)
          : new ChatError(409, 'مساحة المرفقات ممتلئة');
      }
      if (result.attachmentFailure.code === POLICY_REFUSAL_CODE) {
        throw new ChatError(403, 'لا يمكن إرفاق ملف في هذه الرسالة');
      }
      throw new ChatError(500, 'تعذّر إرسال الرسالة');
    }

    await this.repo.setLastRead(conversationId, userId, new Date().toISOString());

    const [message] = await this.hydrate([result.record]);
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

  /**
   * A tombstone, not a delete: the thread keeps its shape. The database bounds
   * an edit in time, never a tombstone, so the only refusal here is "this is not
   * your live message" — someone else's, or one already deleted.
   *
   * The rows go with the tombstone, and so do their objects. #811 left the rows
   * in place and hid them in the UI, which is a storage leak that this closes.
   */
  async deleteMessage(userId: string, messageId: string): Promise<void> {
    const attachments = (await this.repo.findAttachments([messageId])).filter(
      (attachment) => attachment.uploaderId === userId
    );

    if (!(await this.repo.tombstoneMessage(messageId, userId))) {
      throw new ChatError(403, 'لا يمكن حذف هذه الرسالة');
    }

    await this.repo.deleteMessageAttachments(messageId, userId);
    await this.deps.attachments.remove(attachments.map((attachment) => attachment.storagePath));
  }

  /**
   * One attachment's short-lived URL. Membership is the table's RLS (this reads
   * through the caller's client), and the object's own policy is the bucket's;
   * signing happens on the same session, so neither rule is bypassed. Anything
   * that is not a drawing-safe image is `Content-Disposition: attachment`, and
   * SVG, HTML and XML are files here, never something the browser renders.
   */
  async attachmentUrl(
    userId: string,
    conversationId: string,
    attachmentId: string
  ): Promise<{ url: string; fileName: string; mimeType: string; inline: boolean }> {
    await this.assertMember(userId, conversationId);

    const attachment = await this.repo.findAttachmentInConversation(conversationId, attachmentId);
    if (!attachment) throw new ChatError(404, 'المرفق غير موجود');

    const inline = chatAttachmentIsInlineImage(attachment.mimeType);
    const url = await this.deps.attachments.signedUrl(
      attachment.storagePath,
      inline ? null : attachment.fileName
    );
    if (!url) throw new ChatError(502, 'تعذّر تجهيز الملف');

    return {
      url,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      inline,
    };
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
   * The pre-chat screen's one read: the member a handle names, and the thread
   * this pair already has. Nothing is created here — the request is a separate,
   * deliberate click (`startDirect`).
   *
   * A closed thread still resolves to the pair, but only one the caller can
   * open: a withdrawal leaves both roster rows `left`, and the thread page reads
   * the list, so answering with that id would land the member on a 404. It
   * answers "no thread" instead and the request button reopens the same row.
   */
  async preview(userId: string, username: string): Promise<ChatPreview> {
    const handle = username.trim().replace(/^@+/, '').toLowerCase();
    if (!handle) throw new ChatError(400, 'معرِّف العضو مطلوب');

    const user = await this.deps.users.getByUsername(handle);
    if (!user || !user.verified) throw new ChatError(404, 'العضو غير موجود');
    if (user.id === userId) throw new ChatError(400, 'لا يمكنك بدء محادثة مع نفسك');

    const peer = toPeer(user);
    if (!peer) throw new ChatError(404, 'العضو غير موجود');

    const conversationId = await this.findDirectThread(userId, user.id);
    if (!conversationId) return { peer, conversationId: null };

    const participants = await this.repo.findParticipants(conversationId);
    const me = participants.find((participant) => participant.userId === userId);
    return { peer, conversationId: me?.status === 'left' ? null : conversationId };
  }

  /**
   * Tell the other side a request is waiting. The producer is fail-safe: a
   * refused or failed notification never undoes the request itself.
   *
   * A group invite says so, because "wants to start a chat with you" reads as a
   * DM in an inbox that now holds both.
   */
  private async notifyRequest(
    fromUserId: string,
    toUserId: string,
    conversationId: string,
    groupTitle?: string
  ): Promise<void> {
    if (!this.deps.notify) return;

    const me = await this.deps.users.getById(fromUserId);
    const label = me?.name?.trim() || (me ? `@${me.username}` : 'عضو');

    await this.deps.notify({
      user_id: toUserId,
      type: 'chat_request',
      title: groupTitle ? 'دعوة إلى محادثة جماعية' : 'طلب محادثة',
      body: groupTitle
        ? `دعاك ${label} إلى محادثة جماعية «${groupTitle}»`
        : `${label} يريد بدء محادثة معك`,
      metadata: { conversationId },
    });
  }

  /** The ids a caller may invite: deduplicated, and never themselves. */
  private invitableIds(userId: string, memberIds: string[]): string[] {
    return [...new Set(memberIds)].filter((id) => id !== userId);
  }

  /**
   * A group is a room of members, so the invite list is the directory's own
   * ceiling: a verified handle only, exactly as a direct thread's counterpart.
   * The service role read is the one way to know, because `public.users` is not
   * readable by the caller's session.
   */
  private async assertVerified(memberIds: string[]): Promise<void> {
    const members = await this.deps.users.getMany(memberIds);
    const verified = new Set(
      members.filter((member) => member.verified).map((member) => member.id)
    );

    if (memberIds.some((id) => !verified.has(id))) {
      throw new ChatError(400, 'يمكن دعوة الأعضاء الموثَّقين فقط');
    }
  }

  /**
   * The invite itself: `invited`, never `active`, so the other side answers
   * before they read anything. A full room stops the loop and answers its own
   * sentence — the rows already written stay, because an invite that reached
   * someone is not undone by the one that did not.
   */
  private async inviteMembers(
    fromUserId: string,
    conversationId: string,
    groupTitle: string,
    memberIds: string[]
  ): Promise<number> {
    let added = 0;

    for (const memberId of memberIds) {
      try {
        await this.repo.addParticipant({
          conversationId,
          userId: memberId,
          status: 'invited',
          invitedBy: fromUserId,
        });
      } catch (error) {
        // The unique violation means the row is already there: idempotent.
        if (error instanceof DirectThreadExistsError) continue;
        if (error instanceof ChatThreadFullError) {
          throw new ChatError(409, 'بلغت المجموعة الحد الأقصى: 32 عضواً');
        }
        throw error;
      }

      added += 1;
      await this.notifyRequest(fromUserId, memberId, conversationId, groupTitle);
    }

    return added;
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

  /**
   * The composer's meters, in one read: the file cap, today's remaining, the
   * caller's own remaining, and the project's. The server holds the numbers
   * (`app_settings`), so the Free-plan allowances can change without a deploy.
   */
  private async attachmentQuota(): Promise<ChatAttachmentQuota> {
    const allowance = await this.repo.attachmentAllowance();

    return {
      fileBytes: allowance.fileBytes,
      today: { usedBytes: allowance.todayUsedBytes, limitBytes: allowance.todayLimitBytes },
      total: { usedBytes: allowance.totalUsedBytes, limitBytes: allowance.totalLimitBytes },
      project: {
        usedBytes: allowance.projectUsedBytes,
        limitBytes: allowance.projectLimitBytes,
      },
    };
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
