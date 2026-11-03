import { describe, expect, it, vi } from 'vitest';

import { ChatService, ChatError, type ChatServiceDeps } from '@/backend/services/chat/chat-service';
import {
  ChatThreadFullError,
  type ChatRepository,
} from '@/backend/repositories/chat/chat-repository';
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

function makeRepository(
  overrides: Partial<ChatRepository> = {},
  depOverrides: Partial<ChatServiceDeps> = {}
) {
  const repository: ChatRepository = {
    listThreads: vi.fn(async () => []),
    findConversation: vi.fn(async () => null),
    findParticipants: vi.fn(async () => []),
    findDirectPeer: vi.fn(async () => null),
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
      record: {
        id: 'm-1',
        conversationId: 'c-1',
        senderId: me,
        senderKind: 'user' as const,
        body: 'مرحباً',
        replyToId: null,
        editedAt: null,
        deletedAt: null,
        createdAt: '2026-11-01T10:05:00.000Z',
      },
      attachmentFailure: null,
    })),
    findAttachmentInConversation: vi.fn(async () => null),
    attachmentAllowance: vi.fn(async () => ({
      fileBytes: 10 * 1024 * 1024,
      todayUsedBytes: 0,
      todayLimitBytes: 50 * 1024 * 1024,
      totalUsedBytes: 0,
      totalLimitBytes: 100 * 1024 * 1024,
      projectUsedBytes: 0,
      projectLimitBytes: 500 * 1024 * 1024,
    })),
    updateMessageBody: vi.fn(async () => null),
    tombstoneMessage: vi.fn(async () => true),
    deleteMessageAttachments: vi.fn(async () => undefined),
    reportConversation: vi.fn(async () => 'r-1'),
    withdrawRequest: vi.fn(async () => undefined),
    requestThread: vi.fn(async () => false),
    blockUser: vi.fn(async () => undefined),
    unblockUser: vi.fn(async () => undefined),
    findBlockedIds: vi.fn(async () => []),
    ...overrides,
  };

  const deps: ChatServiceDeps = {
    users: {
      getById: vi.fn(async (id: string) => (id === peerId ? peerUser : null)),
      getByUsername: vi.fn(async (username: string) =>
        username === peerUser.username ? peerUser : null
      ),
      getMany: vi.fn(async () => [peerUser]),
      search: vi.fn(async () => [peerUser]),
    },
    checkRateLimit: vi.fn(async () => true),
    attachments: {
      signedUrl: vi.fn(async () => 'https://storage.test/signed'),
      remove: vi.fn(async () => undefined),
    },
    ...depOverrides,
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

  it('tells the peer a request is waiting', async () => {
    const notify = vi.fn(async () => undefined);
    const { service } = makeRepository(
      {},
      {
        notify,
        users: {
          getById: vi.fn(async (id: string) =>
            id === me ? { ...peerUser, id: me, username: 'ahmad', name: 'أحمد' } : peerUser
          ),
          getByUsername: vi.fn(async () => peerUser),
          getMany: vi.fn(async () => [peerUser]),
          search: vi.fn(async () => [peerUser]),
        },
      }
    );

    await service.startDirect(me, peerId);

    expect(notify).toHaveBeenCalledWith({
      user_id: peerId,
      type: 'chat_request',
      title: 'طلب محادثة',
      body: 'أحمد يريد بدء محادثة معك',
      metadata: { conversationId: 'c-1' },
    });
  });

  it('reopens a closed thread instead of opening a second one, and notifies', async () => {
    const notify = vi.fn(async () => undefined);
    const { repository, service } = makeRepository(
      {
        findThreadIdByDirectKey: vi.fn(async () => 'c-closed'),
        requestThread: vi.fn(async () => true),
      },
      { notify }
    );

    await expect(service.startDirect(me, peerId)).resolves.toEqual({
      conversationId: 'c-closed',
    });
    expect(repository.createConversation).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when the existing thread was already open', async () => {
    const notify = vi.fn(async () => undefined);
    const { repository, service } = makeRepository(
      {
        findThreadIdByDirectKey: vi.fn(async () => 'c-open'),
        requestThread: vi.fn(async () => false),
      },
      { notify }
    );

    await service.startDirect(me, peerId);

    expect(repository.requestThread).toHaveBeenCalledWith('c-open');
    expect(notify).not.toHaveBeenCalled();
  });

  it('asks again on the declined thread instead of opening a second one', async () => {
    const notify = vi.fn(async () => undefined);
    const { repository, service } = makeRepository(
      {
        findThreadIdByDirectKey: vi.fn(async () => 'c-declined'),
        requestThread: vi.fn(async () => true),
      },
      { notify }
    );

    await expect(service.startDirect(me, peerId)).resolves.toEqual({
      conversationId: 'c-declined',
    });
    expect(repository.findThreadIdByDirectKey).toHaveBeenCalledWith([me, peerId].sort().join('|'));
    expect(repository.createConversation).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('asks again on a withdrawn thread, whose pair key outlives the roster', async () => {
    const notify = vi.fn(async () => undefined);
    const { repository, service } = makeRepository(
      {
        findThreadIdByDirectKey: vi.fn(async () => 'c-withdrawn'),
        requestThread: vi.fn(async () => true),
      },
      { notify }
    );

    await expect(service.startDirect(me, peerId)).resolves.toEqual({
      conversationId: 'c-withdrawn',
    });
    expect(repository.findThreadIdByDirectKey).toHaveBeenCalledWith([me, peerId].sort().join('|'));
    expect(repository.createConversation).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: peerId, metadata: { conversationId: 'c-withdrawn' } })
    );
  });
});

describe('ChatService.startGroup', () => {
  const groupRow = {
    id: 'g-1',
    kind: 'group',
    title: 'فريق التصميم',
    status: 'active',
    createdBy: me,
    lastMessageAt: null,
    createdAt: '2026-11-01T10:00:00.000Z',
  };

  it('opens the group on its creator and invites everyone else', async () => {
    const { repository, service } = makeRepository({
      createConversation: vi.fn(async () => groupRow),
    });

    await expect(
      service.startGroup(me, { title: 'فريق التصميم', memberIds: [peerId] })
    ).resolves.toEqual({ conversationId: 'g-1' });

    expect(repository.createConversation).toHaveBeenCalledWith({
      kind: 'group',
      title: 'فريق التصميم',
      createdBy: me,
      status: 'active',
    });
    expect(repository.addParticipant).toHaveBeenNthCalledWith(1, {
      conversationId: 'g-1',
      userId: me,
      role: 'owner',
      status: 'active',
    });
    expect(repository.addParticipant).toHaveBeenNthCalledWith(2, {
      conversationId: 'g-1',
      userId: peerId,
      status: 'invited',
      invitedBy: me,
    });
  });

  it('drops the creator and repeated ids before writing', async () => {
    const { repository, service } = makeRepository({
      createConversation: vi.fn(async () => groupRow),
    });

    await service.startGroup(me, { title: 'فريق التصميم', memberIds: [me, peerId, peerId] });

    // The creator's own row, then one invite — not three writes.
    expect(repository.addParticipant).toHaveBeenCalledTimes(2);
  });

  it('refuses a group with nobody else in it', async () => {
    const { repository, service } = makeRepository({
      createConversation: vi.fn(async () => groupRow),
    });

    await expect(service.startGroup(me, { title: 'فريق', memberIds: [me] })).rejects.toMatchObject({
      status: 400,
    });
    expect(repository.createConversation).not.toHaveBeenCalled();
  });

  it('refuses a member the directory does not verify', async () => {
    const { repository, service } = makeRepository({
      createConversation: vi.fn(async () => groupRow),
    });

    await expect(
      service.startGroup(me, {
        title: 'فريق',
        memberIds: ['9c2a7c1e-1f2b-4a3c-8d4e-5f6a7b8c9d0e'],
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(repository.createConversation).not.toHaveBeenCalled();
  });
});

describe('ChatService.addMembers', () => {
  const group = {
    id: 'g-1',
    kind: 'group',
    title: 'فريق التصميم',
    status: 'active',
    createdBy: me,
    lastMessageAt: null,
    createdAt: '2026-11-01T10:00:00.000Z',
  };

  const participant = (userId: string, status: string) => ({
    conversationId: 'g-1',
    userId,
    role: userId === me ? 'owner' : 'member',
    status,
    lastReadAt: null,
    joinedAt: null,
  });

  it('invites only the ids that are not in the roster already', async () => {
    const { repository, service } = makeRepository({
      findConversation: vi.fn(async () => group),
      findParticipants: vi.fn(async () => [
        participant(me, 'active'),
        participant(peerId, 'active'),
      ]),
    });

    await expect(service.addMembers(me, 'g-1', [peerId])).rejects.toMatchObject({ status: 409 });
    expect(repository.addParticipant).not.toHaveBeenCalled();
  });

  it('refuses a caller who is not an active member', async () => {
    const { repository, service } = makeRepository({
      findConversation: vi.fn(async () => group),
      findParticipants: vi.fn(async () => [participant(me, 'invited')]),
    });

    await expect(service.addMembers(me, 'g-1', [peerId])).rejects.toMatchObject({ status: 403 });
    expect(repository.addParticipant).not.toHaveBeenCalled();
  });

  it('refuses a thread that is not a group', async () => {
    const { repository, service } = makeRepository({
      findConversation: vi.fn(async () => ({ ...group, kind: 'direct' })),
    });

    await expect(service.addMembers(me, 'g-1', [peerId])).rejects.toMatchObject({ status: 404 });
    expect(repository.addParticipant).not.toHaveBeenCalled();
  });

  it('names a full room instead of a server failure', async () => {
    const { service } = makeRepository({
      findConversation: vi.fn(async () => group),
      findParticipants: vi.fn(async () => [participant(me, 'active')]),
      addParticipant: vi.fn(async () => {
        throw new ChatThreadFullError();
      }),
    });

    await expect(service.addMembers(me, 'g-1', [peerId])).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('32'),
    });
  });
});

describe('ChatService.withdraw', () => {
  it('closes a request for both sides', async () => {
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
        {
          conversationId: 'c-1',
          userId: peerId,
          role: 'member',
          status: 'requested',
          lastReadAt: null,
          joinedAt: null,
        },
      ]),
    });

    await service.withdraw(me, 'c-1');

    expect(repository.withdrawRequest).toHaveBeenCalledWith('c-1');
  });

  it('refuses once the request was answered', async () => {
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
        {
          conversationId: 'c-1',
          userId: peerId,
          role: 'member',
          status: 'active',
          lastReadAt: null,
          joinedAt: null,
        },
      ]),
    });

    await expect(service.withdraw(me, 'c-1')).rejects.toMatchObject({ status: 409 });
    expect(repository.withdrawRequest).not.toHaveBeenCalled();
  });
});

describe('ChatService.reopen', () => {
  it('asks again on a declined thread and tells the peer', async () => {
    const notify = vi.fn(async () => undefined);
    const { repository, service } = makeRepository(
      {
        findConversation: vi.fn(async () => ({
          id: 'c-1',
          kind: 'direct',
          title: null,
          status: 'declined',
          createdBy: me,
          lastMessageAt: null,
          createdAt: '2026-11-01T10:00:00.000Z',
        })),
        findDirectPeer: vi.fn(async () => peerId),
        requestThread: vi.fn(async () => true),
      },
      { notify }
    );

    await service.reopen(me, 'c-1');

    expect(repository.findDirectPeer).toHaveBeenCalledWith('c-1');
    // The roster hides a `left` caller's peers; the reopen must not read it.
    expect(repository.findParticipants).not.toHaveBeenCalled();
    expect(repository.requestThread).toHaveBeenCalledWith('c-1');
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('refuses a thread whose peer cannot be read', async () => {
    const notify = vi.fn(async () => undefined);
    const { repository, service } = makeRepository(
      {
        findConversation: vi.fn(async () => ({
          id: 'c-1',
          kind: 'direct',
          title: null,
          status: 'declined',
          createdBy: me,
          lastMessageAt: null,
          createdAt: '2026-11-01T10:00:00.000Z',
        })),
        findDirectPeer: vi.fn(async () => null),
      },
      { notify }
    );

    await expect(service.reopen(me, 'c-1')).rejects.toMatchObject({ status: 403 });
    expect(repository.requestThread).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('refuses a thread that is still open', async () => {
    const { repository, service } = makeRepository({
      findConversation: vi.fn(async () => ({
        id: 'c-1',
        kind: 'direct',
        title: null,
        status: 'active',
        createdBy: me,
        lastMessageAt: null,
        createdAt: '2026-11-01T10:00:00.000Z',
      })),
    });

    await expect(service.reopen(me, 'c-1')).rejects.toMatchObject({ status: 409 });
    expect(repository.requestThread).not.toHaveBeenCalled();
  });
});

describe('ChatService.listBlocked', () => {
  it('answers the blocked members with their public face', async () => {
    const { service } = makeRepository({ findBlockedIds: vi.fn(async () => [peerId]) });

    await expect(service.listBlocked(me)).resolves.toEqual([
      { id: peerId, username: 'sara', name: 'سارة', avatarUrl: null, verified: true },
    ]);
  });
});

describe('ChatService.preview', () => {
  it('answers the member and the thread the pair already has', async () => {
    const { repository, service } = makeRepository({
      findThreadIdByDirectKey: vi.fn(async () => 'c-1'),
    });

    await expect(service.preview(me, '@sara')).resolves.toEqual({
      peer: { id: peerId, username: 'sara', name: 'سارة', avatarUrl: null, verified: true },
      conversationId: 'c-1',
    });
    expect(repository.createConversation).not.toHaveBeenCalled();
  });

  it('answers no thread when the pair has never talked', async () => {
    const { service } = makeRepository();

    await expect(service.preview(me, 'sara')).resolves.toEqual({
      peer: { id: peerId, username: 'sara', name: 'سارة', avatarUrl: null, verified: true },
      conversationId: null,
    });
  });

  it('answers the declined thread, whose page still opens', async () => {
    const { service } = makeRepository({
      findThreadIdByDirectKey: vi.fn(async () => 'c-declined'),
      findParticipants: vi.fn(async () => [
        {
          conversationId: 'c-declined',
          userId: me,
          role: 'owner' as const,
          status: 'active' as const,
          lastReadAt: null,
          joinedAt: null,
        },
        {
          conversationId: 'c-declined',
          userId: peerId,
          role: 'member' as const,
          status: 'declined' as const,
          lastReadAt: null,
          joinedAt: null,
        },
      ]),
    });

    await expect(service.preview(me, '@sara')).resolves.toEqual({
      peer: { id: peerId, username: 'sara', name: 'سارة', avatarUrl: null, verified: true },
      conversationId: 'c-declined',
    });
  });

  it('answers no thread when the caller withdrew it, so the picker can ask again', async () => {
    const { service } = makeRepository({
      findThreadIdByDirectKey: vi.fn(async () => 'c-withdrawn'),
      findParticipants: vi.fn(async () => [
        {
          conversationId: 'c-withdrawn',
          userId: me,
          role: 'owner' as const,
          status: 'left' as const,
          lastReadAt: null,
          joinedAt: null,
        },
        {
          conversationId: 'c-withdrawn',
          userId: peerId,
          role: 'member' as const,
          status: 'left' as const,
          lastReadAt: null,
          joinedAt: null,
        },
      ]),
    });

    await expect(service.preview(me, '@sara')).resolves.toEqual({
      peer: { id: peerId, username: 'sara', name: 'سارة', avatarUrl: null, verified: true },
      conversationId: null,
    });
  });

  it('refuses a handle the directory does not have', async () => {
    const { service } = makeRepository(
      {},
      {
        users: {
          getById: vi.fn(async () => null),
          getByUsername: vi.fn(async () => null),
          getMany: vi.fn(async () => []),
          search: vi.fn(async () => []),
        },
      }
    );

    await expect(service.preview(me, 'nobody')).rejects.toMatchObject({ status: 404 });
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

describe('ChatService.leave', () => {
  const activeMembership = [
    {
      conversationId: 'c-1',
      userId: me,
      role: 'owner' as const,
      status: 'active' as const,
      lastReadAt: null,
      joinedAt: null,
    },
  ];

  /**
   * A direct thread has no one-sided exit: its pair declines or withdraws before
   * acceptance and blocks after it. A lone `left` left the peer writing into a
   * thread nobody could read and the leaver with one they could not reopen (#842).
   */
  it('refuses to leave a direct thread and writes nothing', async () => {
    const { repository, service } = makeRepository({
      findParticipants: vi.fn(async () => activeMembership),
      findConversation: vi.fn(async () => ({
        id: 'c-1',
        kind: 'direct',
        title: null,
        status: 'active',
        createdBy: me,
        lastMessageAt: null,
        createdAt: '2026-11-01T10:00:00.000Z',
      })),
    });

    await expect(service.leave(me, 'c-1')).rejects.toMatchObject({
      status: 409,
      message: 'لا يمكن مغادرة محادثة مباشرة',
    });
    expect(repository.setParticipantStatus).not.toHaveBeenCalled();
  });

  it('lets a member leave a group thread', async () => {
    const { repository, service } = makeRepository({
      findParticipants: vi.fn(async () => activeMembership),
      findConversation: vi.fn(async () => ({
        id: 'c-1',
        kind: 'group',
        title: 'المجموعة',
        status: 'active',
        createdBy: me,
        lastMessageAt: null,
        createdAt: '2026-11-01T10:00:00.000Z',
      })),
    });

    await service.leave(me, 'c-1');

    expect(repository.setParticipantStatus).toHaveBeenCalledWith('c-1', me, 'left');
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

describe('ChatService.deleteMessage', () => {
  it('tombstones a message of any age', async () => {
    const { repository, service } = makeRepository();

    await service.deleteMessage(me, 'm-old');

    expect(repository.tombstoneMessage).toHaveBeenCalledWith('m-old', me);
  });

  it('answers a refusal when no row changed', async () => {
    const { service } = makeRepository({
      tombstoneMessage: vi.fn(async () => false),
    });

    await expect(service.deleteMessage(me, 'm-theirs')).rejects.toMatchObject({
      status: 403,
      message: 'لا يمكن حذف هذه الرسالة',
    });
  });
});

describe('ChatService.editMessage', () => {
  it('answers a refusal, not a failure, past the window', async () => {
    const { service } = makeRepository({
      // A guard refusal crosses the repository seam as "no row changed".
      updateMessageBody: vi.fn(async () => null),
    });

    await expect(service.editMessage(me, 'm-old', 'نص')).rejects.toMatchObject({
      status: 403,
      message: 'لا يمكن تعديل هذه الرسالة',
    });
  });
});

const attachmentRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'a-1',
  messageId: 'm-1',
  uploaderId: me,
  storagePath: 'c-1/u-1/report.pdf',
  fileName: 'report.pdf',
  mimeType: 'application/pdf',
  byteSize: 2048,
  ...overrides,
});

/** A caller who is an active member of `c-1`, which is what every read asserts. */
const myMembership = [
  {
    conversationId: 'c-1',
    userId: me,
    role: 'owner',
    status: 'active',
    lastReadAt: null,
    joinedAt: null,
  },
];

describe('ChatService.deleteMessage attachments', () => {
  it('removes the rows and the objects of the caller’s own attachments', async () => {
    const remove = vi.fn(async () => undefined);
    const { service, repository } = makeRepository(
      {
        findAttachments: vi.fn(async () => [
          attachmentRecord(),
          attachmentRecord({
            id: 'a-2',
            uploaderId: peerId,
            storagePath: 'c-1/u-2/theirs.png',
          }),
        ]),
        tombstoneMessage: vi.fn(async () => true),
      },
      { attachments: { signedUrl: vi.fn(async () => null), remove } }
    );

    await service.deleteMessage(me, 'm-1');

    expect(repository.deleteMessageAttachments).toHaveBeenCalledWith('m-1', me);
    // Only what the caller uploaded: another member's file is not theirs to remove.
    expect(remove).toHaveBeenCalledWith(['c-1/u-1/report.pdf']);
  });
});

describe('ChatService.sendMessage attachments', () => {
  it('tombstones the message and names the quota when the rows are refused', async () => {
    const { service, repository } = makeRepository({
      insertMessage: vi.fn(async () => ({
        record: {
          id: 'm-9',
          conversationId: 'c-1',
          senderId: me,
          senderKind: 'user' as const,
          body: null,
          replyToId: null,
          editedAt: null,
          deletedAt: null,
          createdAt: '2026-11-01T10:05:00.000Z',
        },
        attachmentFailure: { code: '53400', message: 'chat attachment daily allowance reached' },
      })),
    });

    await expect(
      service.sendMessage(me, 'c-1', {
        attachments: [
          {
            storagePath: 'c-1/u-1/report.pdf',
            fileName: 'report.pdf',
            mimeType: 'application/pdf',
            byteSize: 2048,
          },
        ],
      })
    ).rejects.toMatchObject({
      status: 429,
      message: 'بلغت حدّ المرفقات اليوم، يعود غداً',
    });

    // No message that claims files it does not have.
    expect(repository.tombstoneMessage).toHaveBeenCalledWith('m-9', me);
  });

  it('answers the project wall as its own sentence', async () => {
    const { service } = makeRepository({
      insertMessage: vi.fn(async () => ({
        record: {
          id: 'm-9',
          conversationId: 'c-1',
          senderId: me,
          senderKind: 'user' as const,
          body: null,
          replyToId: null,
          editedAt: null,
          deletedAt: null,
          createdAt: '2026-11-01T10:05:00.000Z',
        },
        attachmentFailure: { code: '53400', message: 'chat attachment project storage is full' },
      })),
    });

    await expect(
      service.sendMessage(me, 'c-1', {
        attachments: [
          {
            storagePath: 'c-1/u-1/report.pdf',
            fileName: 'report.pdf',
            mimeType: 'application/pdf',
            byteSize: 2048,
          },
        ],
      })
    ).rejects.toMatchObject({
      status: 409,
      message: 'مساحة مرفقات الموقع ممتلئة، حاول لاحقاً',
    });
  });

  it('names a path the guard refused as a policy answer', async () => {
    const { service } = makeRepository({
      insertMessage: vi.fn(async () => ({
        record: {
          id: 'm-9',
          conversationId: 'c-1',
          senderId: me,
          senderKind: 'user' as const,
          body: null,
          replyToId: null,
          editedAt: null,
          deletedAt: null,
          createdAt: '2026-11-01T10:05:00.000Z',
        },
        attachmentFailure: {
          code: '42501',
          message: 'an attachment lives in its conversation folder',
        },
      })),
    });

    await expect(
      service.sendMessage(me, 'c-1', {
        attachments: [
          {
            storagePath: 'c-2/u-1/report.pdf',
            fileName: 'report.pdf',
            mimeType: 'application/pdf',
            byteSize: 2048,
          },
        ],
      })
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('ChatService.attachmentUrl', () => {
  it('serves a PDF as a download and leaves an image inline', async () => {
    const signedUrl = vi.fn(async () => 'https://storage.test/signed');
    const { service } = makeRepository(
      {
        findParticipants: vi.fn(async () => myMembership),
        findAttachmentInConversation: vi.fn(async () => attachmentRecord()),
      },
      { attachments: { signedUrl, remove: vi.fn(async () => undefined) } }
    );

    const file = await service.attachmentUrl(me, 'c-1', 'a-1');
    expect(file.inline).toBe(false);
    expect(signedUrl).toHaveBeenCalledWith('c-1/u-1/report.pdf', 'report.pdf');
  });

  it('treats an SVG as a file, never a drawing', async () => {
    const signedUrl = vi.fn(async () => 'https://storage.test/signed');
    const { service } = makeRepository(
      {
        findParticipants: vi.fn(async () => myMembership),
        findAttachmentInConversation: vi.fn(async () =>
          attachmentRecord({ fileName: 'logo.svg', mimeType: 'image/svg+xml' })
        ),
      },
      { attachments: { signedUrl, remove: vi.fn(async () => undefined) } }
    );

    const file = await service.attachmentUrl(me, 'c-1', 'a-1');
    expect(file.inline).toBe(false);
    expect(signedUrl).toHaveBeenCalledWith('c-1/u-1/report.pdf', 'logo.svg');
  });

  it('answers 404 for an attachment the caller cannot read', async () => {
    const { service } = makeRepository({
      findParticipants: vi.fn(async () => myMembership),
      findAttachmentInConversation: vi.fn(async () => null),
    });

    await expect(service.attachmentUrl(me, 'c-1', 'a-theirs')).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('ChatService.getThread attachments', () => {
  it('reads the allowances from the server and shapes them for the composer', async () => {
    const { service } = makeRepository({
      listThreads: vi.fn(async () => [
        {
          id: 'c-1',
          kind: 'direct',
          title: null,
          status: 'active',
          createdAt: '2026-11-01T10:00:00.000Z',
          lastMessageAt: null,
          unreadCount: 0,
          lastMessageBody: null,
          lastMessageSenderKind: null,
          lastMessageCreatedAt: null,
          lastMessageHasAttachments: false,
          counterpartId: peerId,
          myStatus: 'active',
          myRole: 'owner',
          myLastReadAt: null,
        },
      ]),
      findConversation: vi.fn(async () => ({
        id: 'c-1',
        kind: 'direct',
        title: null,
        status: 'active',
        createdBy: me,
        lastMessageAt: null,
        createdAt: '2026-11-01T10:00:00.000Z',
      })),
      findParticipants: vi.fn(async () => myMembership),
      attachmentAllowance: vi.fn(async () => ({
        fileBytes: 10 * 1024 * 1024,
        todayUsedBytes: 1024,
        todayLimitBytes: 50 * 1024 * 1024,
        totalUsedBytes: 2048,
        totalLimitBytes: 100 * 1024 * 1024,
        projectUsedBytes: 4096,
        projectLimitBytes: 500 * 1024 * 1024,
      })),
    });

    const thread = await service.getThread(me, 'c-1');

    expect(thread?.attachmentQuota).toEqual({
      fileBytes: 10 * 1024 * 1024,
      today: { usedBytes: 1024, limitBytes: 50 * 1024 * 1024 },
      total: { usedBytes: 2048, limitBytes: 100 * 1024 * 1024 },
      project: { usedBytes: 4096, limitBytes: 500 * 1024 * 1024 },
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

  it('draws a group by its title and never as a member’s face', async () => {
    const { service } = makeRepository({
      listThreads: vi.fn(async () => [
        {
          id: 'g-1',
          kind: 'group',
          title: 'فريق التصميم',
          status: 'active',
          createdAt: '2026-11-01T10:00:00.000Z',
          lastMessageAt: null,
          unreadCount: 0,
          lastMessageBody: null,
          lastMessageSenderKind: null,
          lastMessageCreatedAt: null,
          lastMessageHasAttachments: false,
          // The list read orders a member first; a group must not wear them.
          counterpartId: peerId,
          myStatus: 'active',
          myRole: 'owner',
          myLastReadAt: null,
        },
      ]),
    });

    const [thread] = await service.listThreads(me);

    expect(thread).toMatchObject({ title: 'فريق التصميم', counterpart: null });
  });

  it('drops a declined group invite, which is a dead row the member never joined', async () => {
    const row = (kind: 'direct' | 'group', myStatus: string) => ({
      id: `${kind}-1`,
      kind,
      title: kind === 'group' ? 'فريق' : null,
      status: kind === 'group' ? 'active' : 'declined',
      createdAt: '2026-11-01T10:00:00.000Z',
      lastMessageAt: null,
      unreadCount: 0,
      lastMessageBody: null,
      lastMessageSenderKind: null,
      lastMessageCreatedAt: null,
      lastMessageHasAttachments: false,
      counterpartId: kind === 'direct' ? peerId : null,
      myStatus,
      myRole: 'member',
      myLastReadAt: null,
    });

    const { service } = makeRepository({
      listThreads: vi.fn(async () => [row('group', 'declined'), row('direct', 'declined')]),
    });

    const threads = await service.listThreads(me);

    // The direct row stays: its own thread is closed and the surface says so.
    expect(threads.map((thread) => thread.id)).toEqual(['direct-1']);
  });
});
