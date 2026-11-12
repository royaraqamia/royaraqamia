import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { useEffect } from 'react';
import { IDBFactory } from 'fake-indexeddb';

const api = vi.hoisted(() => ({
  getChatThreads: vi.fn(),
  respondToChat: vi.fn(),
  startDirectChat: vi.fn(),
  subscribeToChatList: vi.fn(() => () => {}),
}));

vi.mock('@/frontend/api/chats', () => ({
  getChatThreads: api.getChatThreads,
  respondToChat: api.respondToChat,
  startDirectChat: api.startDirectChat,
  subscribeToChatList: api.subscribeToChatList,
}));

vi.mock('@/frontend/state/session-provider', () => ({
  useSession: () => ({ user: { id: 'u-1' } }),
}));

import { useChatThreads, type ChatThreadsState } from '@/frontend/state/chats/use-chat-threads';
import { ChatsLocalStore } from '@/frontend/api/chats/local-store';
import type { ChatConversationSummary } from '@/shared/contracts/chat';

const IDENTITY = 'user:u-1' as const;

function thread(id: string, lastMessageAt: string): ChatConversationSummary {
  return {
    id,
    kind: 'direct',
    status: 'active',
    title: id,
    counterpart: null,
    myStatus: 'active',
    lastMessage: { body: id, senderKind: 'user', createdAt: lastMessageAt, hasAttachments: false },
    unreadCount: 0,
    openActions: 0,
    lastMessageAt,
    createdAt: lastMessageAt,
  };
}

let captured: ChatThreadsState | null = null;

function Harness() {
  const state = useChatThreads(true, IDENTITY);
  useEffect(() => {
    captured = state;
  });
  return null;
}

async function renderHook() {
  render(<Harness />);
  await waitFor(() => expect(captured).not.toBeNull());
  return captured!;
}

/**
 * A refused write is a sentence on this surface, not an unhandled rejection: the
 * picker's row calls `void onPick(peer)`, so a throw is a click that does
 * nothing at all (the chats #811 regression that made a 500 look like a dead
 * button).
 */
describe('useChatThreads writes', () => {
  beforeEach(() => {
    captured = null;
    // A fresh factory per test: the store registry is keyed by it, so one test's
    // cached list cannot paint in the next (#1033).
    Object.defineProperty(globalThis, 'indexedDB', {
      value: new IDBFactory(),
      configurable: true,
      writable: true,
    });
    api.getChatThreads.mockReset().mockResolvedValue([]);
    api.respondToChat.mockReset();
    api.startDirectChat.mockReset();
    api.subscribeToChatList.mockReset().mockReturnValue(() => {});
  });

  it('opens a thread', async () => {
    api.startDirectChat.mockResolvedValue({ success: true, conversationId: 'c-1' });
    const state = await renderHook();

    await act(async () => {
      await expect(state.start('peer-1')).resolves.toBe('c-1');
    });
  });

  it('answers a failed start with null instead of rejecting', async () => {
    api.startDirectChat.mockRejectedValue(
      new Error('حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.')
    );
    const state = await renderHook();

    await act(async () => {
      await expect(state.start('peer-1')).resolves.toBeNull();
    });
  });

  it('accepts a request', async () => {
    api.respondToChat.mockResolvedValue({ success: true });
    const state = await renderHook();

    await act(async () => {
      await expect(state.respond('c-1', 'accept')).resolves.toBeNull();
    });
  });

  it('returns the refusal the call carried', async () => {
    api.respondToChat.mockRejectedValue(new Error('تم تجاوز الحد: بدء المحادثات محدود'));
    const state = await renderHook();

    await act(async () => {
      await expect(state.respond('c-1', 'accept')).resolves.toBe(
        'تم تجاوز الحد: بدء المحادثات محدود'
      );
    });
  });
});

/**
 * The list reads from the device first (#1033): a read is written down before it
 * is painted, so a cold entry, or a phone with no signal, shows the conversations
 * it already knew instead of an empty tab.
 */
describe('useChatThreads cache', () => {
  beforeEach(() => {
    captured = null;
    Object.defineProperty(globalThis, 'indexedDB', {
      value: new IDBFactory(),
      configurable: true,
      writable: true,
    });
    api.respondToChat.mockReset();
    api.startDirectChat.mockReset();
    api.subscribeToChatList.mockReset().mockReturnValue(() => {});
    window.localStorage.clear();
  });

  it('paints the cached list when the read fails', async () => {
    api.getChatThreads.mockReset().mockResolvedValue([thread('c-1', '2026-11-01T10:00:00.000Z')]);
    const first = render(<Harness />);
    await waitFor(() => expect(captured?.threads).toHaveLength(1));
    first.unmount();

    // The snapshot is the first frame's copy; the store is the durable one, so
    // this test drops the first and proves the second.
    window.localStorage.clear();
    captured = null;
    api.getChatThreads.mockRejectedValue(new Error('تعذّر الاتصال بالخادم'));

    const second = render(<Harness />);
    await waitFor(() => expect(captured?.threads).toHaveLength(1));

    expect(captured!.threads[0]?.id).toBe('c-1');
    expect(captured!.painted).toBe(true);
    expect(captured!.error).toBeTruthy();
    second.unmount();
  });

  it('keeps the list in the device store, newest first', async () => {
    const older = thread('c-old', '2026-10-01T10:00:00.000Z');
    const newer = thread('c-new', '2026-11-01T10:00:00.000Z');
    api.getChatThreads.mockReset().mockResolvedValue([older, newer]);

    render(<Harness />);
    await waitFor(() => expect(captured?.threads).toHaveLength(2));

    const store = await ChatsLocalStore.open(IDENTITY);
    const cached = await store.getThreads();
    store.close();

    expect(cached.map((row) => row.id)).toEqual(['c-new', 'c-old']);
  });
});
