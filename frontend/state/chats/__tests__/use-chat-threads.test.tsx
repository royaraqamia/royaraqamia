import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { useEffect } from 'react';

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

let captured: ChatThreadsState | null = null;

function Harness() {
  const state = useChatThreads(true);
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
