import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  forgetAssistantThread,
  readAssistantSnapshot,
  readCachedConversation,
  saveCachedConversation,
  writeAssistantSnapshot,
} from '@/frontend/api/chats/assistant-cache';
import {
  assistantWasOpened,
  rememberAssistantOpened,
} from '@/frontend/ui/assistant/assistant-hint';
import { userIdentity } from '@/frontend/shared/local-store/identity';
import type { ChatAgentAllowance, ChatMessage, ChatThread } from '@/shared/contracts/chat';

const IDENTITY = userIdentity('u-cache');
const OTHER = userIdentity('u-other');

const ALLOWANCE: ChatAgentAllowance = {
  plan: 'pro',
  member: { used: 1, cap: 40 },
  project: { used: 10, limit: 900 },
  resetsAt: '2026-11-10T00:00:00.000Z',
};

const QUOTA = {
  fileBytes: 1_000,
  today: { usedBytes: 0, limitBytes: 10_000 },
  total: { usedBytes: 0, limitBytes: 100_000 },
  project: { usedBytes: 0, limitBytes: 500_000 },
};

function thread(id: string): ChatThread {
  return {
    id,
    kind: 'agent',
    status: 'active',
    title: 'نور',
    counterpart: null,
    myStatus: 'active',
    lastMessage: null,
    unreadCount: 0,
    lastMessageAt: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    participants: [],
    me: null,
    blockedByMe: false,
    canWrite: true,
    attachmentQuota: QUOTA,
  } as unknown as ChatThread;
}

function message(conversationId: string, id: string): ChatMessage {
  return {
    id,
    conversationId,
    senderId: null,
    senderKind: 'agent',
    body: id,
    replyToId: null,
    editedAt: null,
    deletedAt: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    clientId: null,
    attachments: [],
    replyTo: null,
  } as unknown as ChatMessage;
}

/**
 * The panel's cache (ADR-0150). The remembered face is a hint, never a grant:
 * it only decides which of the server's answers is painted first.
 */
describe('assistant cache', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('remembers the thread and the last answer under the identity', () => {
    writeAssistantSnapshot(IDENTITY, {
      threadId: 'a-1',
      available: true,
      allowance: ALLOWANCE,
    });

    expect(readAssistantSnapshot(IDENTITY)).toEqual({
      threadId: 'a-1',
      available: true,
      allowance: ALLOWANCE,
    });
    expect(readAssistantSnapshot(OTHER)).toBeNull();
  });

  it('ignores a corrupt or wrongly shaped value', () => {
    window.localStorage.setItem(`royaraqamia:assistant:${IDENTITY}`, 'not json');
    expect(readAssistantSnapshot(IDENTITY)).toBeNull();

    window.localStorage.setItem(
      `royaraqamia:assistant:${IDENTITY}`,
      JSON.stringify({ threadId: 'a-1', allowance: { plan: 40 } })
    );
    expect(readAssistantSnapshot(IDENTITY)).toEqual({
      threadId: 'a-1',
      available: true,
      allowance: null,
    });
  });

  it('forgets only the thread when the conversation is gone', () => {
    writeAssistantSnapshot(IDENTITY, {
      threadId: 'a-1',
      available: true,
      allowance: ALLOWANCE,
    });

    forgetAssistantThread(IDENTITY);

    expect(readAssistantSnapshot(IDENTITY)).toEqual({
      threadId: null,
      available: true,
      allowance: null,
    });
  });

  it('remembers that the door has been opened', () => {
    expect(assistantWasOpened()).toBe(false);
    rememberAssistantOpened();
    expect(assistantWasOpened()).toBe(true);
  });

  it('keeps the newest page the panel read for the next open', async () => {
    const cachedThread = thread('a-cached');
    const cachedMessages = [message('a-cached', 'm-1')];

    await saveCachedConversation(IDENTITY, cachedThread, cachedMessages);

    const cached = await readCachedConversation(IDENTITY, 'a-cached');
    expect(cached?.thread.id).toBe('a-cached');
    expect(cached?.messages.map((row) => row.id)).toEqual(['m-1']);
  });

  it('never answers another identity’s conversation', async () => {
    await saveCachedConversation(IDENTITY, thread('a-private'), [message('a-private', 'm-1')]);

    await expect(readCachedConversation(OTHER, 'a-private')).resolves.toBeNull();
  });

  it('treats an unavailable IndexedDB as a cache miss', async () => {
    const original = globalThis.indexedDB;
    // A browser that refuses storage: the panel falls through to the network.
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true });
    try {
      await expect(readCachedConversation(IDENTITY, 'a-1')).resolves.toBeNull();
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { value: original, configurable: true });
    }
  });
});
