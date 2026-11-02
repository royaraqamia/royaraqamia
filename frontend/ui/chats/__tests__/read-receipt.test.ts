import { describe, expect, it } from 'vitest';

import { readReceiptOf, typingLabel } from '@/frontend/ui/chats/read-receipt';
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

    expect(readReceiptOf(at, makeMessage(LINE), true)).toBe('قُرئت');
    expect(readReceiptOf(past, makeMessage(LINE), true)).toBe('قُرئت');
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

  it('counts a group’s active members past the line, never the reader', () => {
    const thread = makeThread('group', [
      participant(ME, AFTER),
      participant(PEER, AFTER),
      participant('peer-3', LINE),
      participant('peer-4', BEFORE),
      // An invited member has not read anything: they are not in the thread yet.
      participant('peer-5', AFTER, 'invited'),
    ]);

    expect(readReceiptOf(thread, makeMessage(LINE), true)).toBe('قرأها 2');
  });

  it('says nothing in a group no one has reached yet', () => {
    const thread = makeThread('group', [
      participant(ME, null),
      participant(PEER, BEFORE),
      participant('peer-3', null),
    ]);

    expect(readReceiptOf(thread, makeMessage(LINE), true)).toBeNull();
  });
});

/** The who-is-writing sentence: a direct thread names the act, a group names the member. */
describe('typingLabel', () => {
  const group = makeThread('group', [
    participant(ME, null),
    participant(PEER, null),
    participant('peer-3', null),
  ]);

  it('says nothing when nobody is writing', () => {
    expect(typingLabel(group, [])).toBeNull();
  });

  it('names the act in a direct thread, which the header already names', () => {
    const direct = makeThread('direct', [participant(ME, null), participant(PEER, null)]);

    expect(typingLabel(direct, [PEER])).toBe('يكتب الآن...');
  });

  it('names the member in a group, and the rest of them when several are writing', () => {
    expect(typingLabel(group, [PEER])).toBe('peer-2 يكتب...');
    expect(typingLabel(group, [PEER, 'peer-3'])).toBe('peer-2 وآخرون يكتبون...');
  });
});
