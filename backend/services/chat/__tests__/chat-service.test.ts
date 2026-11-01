import { describe, expect, it, vi } from 'vitest';

import { ChatService, ChatError, type ChatServiceDeps } from '@/backend/services/chat/chat-service';
import type { ChatRepository } from '@/backend/repositories/chat/chat-repository';
import type { PublicUser } from '@/shared/contracts/users';

const me = '5f0f3c62-6a37-4a0b-9f0e-2b4c8f7a1d33';
const peerId = '0d6a1b51-52a1-4c1f-8a4e-9b0b3d8f6a11';

const peerUser: PublicUser = {
  id: peerId,
  username: 'sara',
  name: 'سارة',
  avatar_url: null,
  bio: null,
  verified: true,
};

function makeRepository(overrides: Partial<ChatRepository> = {}) {
  const repository: ChatRepository = {
    listThreads: vi.fn(async () => []),
    findConversation: vi.fn(async () => null),
    findParticipants: vi.fn(async () => []),
    findThreadIdByDirectKey: vi.fn(async () => null),
    createConversation: vi.fn(async () => ({
      id: 'c-1',
      kind: 'direct',
      title: null,
      status: 'requested',
      createdBy: me,
      lastMessageAt: null,
      createdAt: '2026-11-01T10:00:00.000Z',
    })),
    addParticipant: vi.fn(async () => undefined),
    setParticipantStatus: vi.fn(async () => undefined),
    setLastRead: vi.fn(async () => undefined),
    findMessages: vi.fn(async () => []),
    findMessagesByIds: vi.fn(async () => []),
    findAttachments: vi.fn(async () => []),
    insertMessage: vi.fn(async () => ({
      id: 'm-1',
      conversationId: 'c-1',
      senderId: me,
      senderKind: 'user' as const,
      body: 'مرحباً',
      replyToId: null,
      editedAt: null,
      deletedAt: null,
      createdAt: '2026-11-01T10:05:00.000Z',
    })),
    updateMessageBody: vi.fn(async () => null),
    tombstoneMessage: vi.fn(async () => undefined),
    deleteMessageAttachments: vi.fn(async () => undefined),
    reportConversation: vi.fn(async () => 'r-1'),
    blockUser: vi.fn(async () => undefined),
    unblockUser: vi.fn(async () => undefined),
    findBlockedIds: vi.fn(async () => []),
    ...overrides,
  };

  const deps: ChatServiceDeps = {
    users: {
      getById: vi.fn(async (id: string) => (id === peerId ? peerUser : null)),
      getMany: vi.fn(async () => [peerUser]),
      search: vi.fn(async () => [peerUser]),
    },
    checkRateLimit: vi.fn(async () => true),
  };

  return { repository, deps, service: new ChatService(repository, deps) };
}

describe('ChatService.startDirect', () => {
  it('answers with the thread that already exists for the pair', async () => {
    const { repository, service } = makeRepository({
      findThreadIdByDirectKey: vi.fn(async () => 'c-existing'),
    });

    await expect(service.startDirect(me, peerId)).resolves.toEqual({
      conversationId: 'c-existing',
    });
    expect(repository.createConversation).not.toHaveBeenCalled();
  });

  it('refuses a conversation with yourself before any write', async () => {
    const { repository, service } = makeRepository();

    await expect(service.startDirect(me, me)).rejects.toBeInstanceOf(ChatError);
    expect(repository.createConversation).not.toHaveBeenCalled();
  });

  it('refuses a peer the caller has blocked', async () => {
    const { repository, service } = makeRepository({
      findBlockedIds: vi.fn(async () => [peerId]),
    });

    await expect(service.startDirect(me, peerId)).rejects.toMatchObject({ status: 403 });
    expect(repository.createConversation).not.toHaveBeenCalled();
  });

  it('opens the thread as a request: the caller active, the peer pending', async () => {
    const { repository, service } = makeRepository();

    const result = await service.startDirect(me, peerId);

    expect(result.conversationId).toBe('c-1');
    expect(repository.addParticipant).toHaveBeenNthCalledWith(1, {
      conversationId: 'c-1',
      userId: me,
      role: 'owner',
      status: 'active',
    });
    expect(repository.addParticipant).toHaveBeenNthCalledWith(2, {
      conversationId: 'c-1',
      userId: peerId,
      status: 'requested',
      invitedBy: me,
    });
  });
});

describe('ChatService.respond', () => {
  it('refuses when nothing is waiting on the caller', async () => {
    const { repository, service } = makeRepository({
      findParticipants: vi.fn(async () => [
        {
          conversationId: 'c-1',
          userId: me,
          role: 'owner',
          status: 'active',
          lastReadAt: null,
          joinedAt: null,
        },
      ]),
    });

    await expect(service.respond(me, 'c-1', 'accept')).rejects.toMatchObject({ status: 409 });
    expect(repository.setParticipantStatus).not.toHaveBeenCalled();
  });

  it('accepts a request by activating the caller', async () => {
    const { repository, service } = makeRepository({
      findParticipants: vi.fn(async () => [
        {
          conversationId: 'c-1',
          userId: me,
          role: 'member',
          status: 'requested',
          lastReadAt: null,
          joinedAt: null,
        },
      ]),
    });

    await service.respond(me, 'c-1', 'accept');
    expect(repository.setParticipantStatus).toHaveBeenCalledWith('c-1', me, 'active');
  });
});

describe('ChatService.sendMessage', () => {
  it('refuses a blank message', async () => {
    const { repository, service } = makeRepository();

    await expect(service.sendMessage(me, 'c-1', { body: '   ' })).rejects.toMatchObject({
      status: 400,
    });
    expect(repository.insertMessage).not.toHaveBeenCalled();
  });

  it('stores the normalised body and stamps the writer as read', async () => {
    const { repository, service } = makeRepository();

    // Escaped: the digit gate refuses the literal form in source (ADR-0054).
    await service.sendMessage(me, 'c-1', { body: `  رقم \u0661\u0662  ` });

    expect(repository.insertMessage).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'رقم 12', senderKind: 'user', senderId: me })
    );
    expect(repository.setLastRead).toHaveBeenCalledWith('c-1', me, expect.any(String));
  });

  it('answers 429 when the rate limit refuses', async () => {
    const { service, deps } = makeRepository();
    (deps.checkRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    await expect(service.sendMessage(me, 'c-1', { body: 'مرحباً' })).rejects.toMatchObject({
      status: 429,
    });
  });
});

describe('ChatService.listThreads', () => {
  it('names a direct row after the counterpart and previews the last line', async () => {
    const { service } = makeRepository({
      listThreads: vi.fn(async () => [
        {
          id: 'c-1',
          kind: 'direct',
          title: null,
          status: 'active',
          createdAt: '2026-11-01T10:00:00.000Z',
          lastMessageAt: '2026-11-01T10:05:00.000Z',
          unreadCount: 2,
          lastMessageBody: 'كيف حالك؟',
          lastMessageSenderKind: 'user' as const,
          lastMessageCreatedAt: '2026-11-01T10:05:00.000Z',
          lastMessageHasAttachments: false,
          counterpartId: peerId,
          myStatus: 'active',
          myRole: 'owner',
          myLastReadAt: null,
        },
      ]),
    });

    const [thread] = await service.listThreads(me);

    expect(thread).toMatchObject({
      title: 'سارة',
      unreadCount: 2,
      myStatus: 'active',
      lastMessage: { body: 'كيف حالك؟', hasAttachments: false },
    });
    expect(thread?.counterpart?.username).toBe('sara');
  });
});
