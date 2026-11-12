import { describe, expect, it } from 'vitest';

import { readReceiptOf } from '@/frontend/ui/chats/read-receipt';
import type { ChatMessage, ChatParticipant, ChatPeer, ChatThread } from '@/shared/contracts/chat';

const ME = 'me';
const PEER = 'peer-2';

const peer = (id: string, name: string): ChatPeer => ({
  id,
  username: id,
  name,
  avatarUrl: null,
  verified: false,
});

function participant(
  userId: string,
  lastReadAt: string | null,
  status: ChatParticipant['status'] = 'active'
): ChatParticipant {
  return { userId, role: 'member', status, lastReadAt, joinedAt: null, peer: peer(userId, userId) };
}

function makeThread(kind: ChatThread['kind'], participants: ChatParticipant[]): ChatThread {
  return {
    id: 'c-1',
    kind,
    status: 'active',
    title: 'محادثة',
    counterpart: kind === 'direct' ? peer(PEER, PEER) : null,
    myStatus: 'active',
    lastMessage: null,
    unreadCount: 0,
    openActions: 0,
    lastMessageAt: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    participants,
    me: participant(ME, null),
    blockedByMe: false,
    canWrite: true,
    attachmentQuota: {
      fileBytes: 10 * 1024 * 1024,
      today: { usedBytes: 0, limitBytes: 50 * 1024 * 1024 },
      total: { usedBytes: 0, limitBytes: 100 * 1024 * 1024 },
      project: { usedBytes: 0, limitBytes: 500 * 1024 * 1024 },
    },
  };
}

function makeMessage(createdAt = '2026-11-01T10:00:00.000Z'): ChatMessage {
  return {
    id: 'm-1',
    conversationId: 'c-1',
    senderId: ME,
    senderKind: 'user',
    body: 'مرحباً',
    replyToId: null,
    editedAt: null,
    deletedAt: null,
    createdAt,
    attachments: [],
    replyTo: null,
  };
}

const LINE = '2026-11-01T10:00:00.000Z';
const AFTER = '2026-11-01T10:00:01.000Z';
const BEFORE = '2026-11-01T09:59:59.000Z';

/**
 * A receipt is the roster's watermark read against one line (#816) — no receipt
 * row exists, so the only question is whether it says nothing, «قُرئت» or a
 * count.
 */
describe('readReceiptOf', () => {
  it('says nothing in a direct thread until the peer has reached the line', () => {
    const thread = makeThread('direct', [participant(ME, null), participant(PEER, BEFORE)]);

    expect(readReceiptOf(thread, makeMessage(LINE), true)).toBeNull();
  });

  it('says «قُرئت» once the peer’s watermark is at or past the line', () => {
    const at = makeThread('direct', [participant(ME, null), participant(PEER, LINE)]);
    const past = makeThread('direct', [participant(ME, null), participant(PEER, AFTER)]);

    expect(readReceiptOf(at, makeMessage(LINE), true)).toEqual({ kind: 'peer' });
    expect(readReceiptOf(past, makeMessage(LINE), true)).toEqual({ kind: 'peer' });
  });

  it('never marks the peer’s own line as read to itself', () => {
    const thread = makeThread('direct', [participant(ME, null), participant(PEER, AFTER)]);

    expect(readReceiptOf(thread, makeMessage(LINE), false)).toBeNull();
  });

  it('puts no receipt on a tombstone', () => {
    const thread = makeThread('direct', [participant(ME, null), participant(PEER, AFTER)]);
    const message = { ...makeMessage(LINE), deletedAt: '2026-11-01T10:05:00.000Z' };

    expect(readReceiptOf(thread, message, true)).toBeNull();
  });

  it('puts no receipt on a group thread, which the UI does not open', () => {
    const thread = makeThread('group', [participant(ME, null), participant(PEER, AFTER)]);

    expect(readReceiptOf(thread, makeMessage(LINE), true)).toBeNull();
  });
});
