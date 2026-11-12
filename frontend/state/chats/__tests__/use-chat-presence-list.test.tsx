import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useEffect } from 'react';

const api = vi.hoisted(() => ({ joinChatPresenceChannel: vi.fn() }));

vi.mock('@/frontend/api/chats', () => api);

import { useChatPresence } from '@/frontend/state/chats/use-chat-presence';
import {
  useChatPresenceList,
  type ChatPresenceMap,
} from '@/frontend/state/chats/use-chat-presence-list';
import {
  CHAT_PRESENCE_CHANNEL_GRACE_MS,
  closeAllChatPresence,
} from '@/frontend/state/chats/presence-channels';
import type { ChatConversationSummary, ChatPresenceEvent } from '@/shared/contracts/chat';

function direct(id: string, peerId: string): ChatConversationSummary {
  return {
    id,
    kind: 'direct',
    status: 'active',
    title: 'سارة',
    counterpart: {
      id: peerId,
      username: 'sara',
      name: 'سارة',
      avatarUrl: null,
      verified: true,
    },
    myStatus: 'active',
    lastMessage: null,
    unreadCount: 0,
    lastMessageAt: null,
    createdAt: '2026-11-01T00:00:00.000Z',
  };
}

const GROUP: ChatConversationSummary = {
  id: 'g-1',
  kind: 'group',
  status: 'active',
  title: 'فريق',
  counterpart: null,
  myStatus: 'active',
  lastMessage: null,
  unreadCount: 0,
  lastMessageAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
};

const REQUESTED: ChatConversationSummary = {
  ...direct('c-9', 'peer-9'),
  status: 'requested',
};

let captured: ChatPresenceMap = {};

function Harness({
  threads,
  selfId,
}: {
  threads: ChatConversationSummary[];
  selfId: string | null;
}) {
  const presence = useChatPresenceList(threads, selfId);
  useEffect(() => {
    captured = presence;
  });
  return null;
}

const leave = vi.fn();

/** The thread's own hook, as `/chats/<id>` mounts it. */
function ThreadHarness({ selfId }: { selfId: string }) {
  useChatPresence('c-1', selfId);
  return null;
}

/** The callback the conversation's channel was given. */
function channelEvent(conversationId: string, event: ChatPresenceEvent) {
  const call = api.joinChatPresenceChannel.mock.calls.find((entry) => entry[0] === conversationId);
  const onEvent = call?.[2] as ((event: ChatPresenceEvent) => void) | undefined;
  act(() => onEvent?.(event));
}

describe('useChatPresenceList', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    captured = {};
    // The registry is module state: a topic a previous test left waiting must
    // not be the one this test joins.
    closeAllChatPresence();
    api.joinChatPresenceChannel
      .mockReset()
      .mockReturnValue({ announce: vi.fn(), stop: vi.fn(), leave });
    leave.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('joins one channel per direct, active row', () => {
    render(<Harness threads={[direct('c-1', 'peer-1'), direct('c-2', 'peer-2')]} selfId="me" />);

    expect(api.joinChatPresenceChannel).toHaveBeenCalledTimes(2);
    expect(api.joinChatPresenceChannel).toHaveBeenCalledWith('c-1', 'me', expect.any(Function));
    expect(api.joinChatPresenceChannel).toHaveBeenCalledWith('c-2', 'me', expect.any(Function));
  });

  it('joins nothing while nobody is signed in', () => {
    render(<Harness threads={[direct('c-1', 'peer-1')]} selfId={null} />);

    expect(api.joinChatPresenceChannel).not.toHaveBeenCalled();
  });

  it('does not join a group or a request that is not active', () => {
    render(<Harness threads={[GROUP, REQUESTED]} selfId="me" />);

    expect(api.joinChatPresenceChannel).not.toHaveBeenCalled();
  });

  it('draws the thread a peer event names, and expires it', () => {
    render(<Harness threads={[direct('c-1', 'peer-1')]} selfId="me" />);

    channelEvent('c-1', { conversationId: 'c-1', userId: 'peer-1', state: 'typing' });
    expect(captured).toEqual({ 'c-1': 'typing' });

    act(() => vi.advanceTimersByTime(5_000));
    expect(captured).toEqual({});
  });

  it('keeps a recording for its wider window', () => {
    render(<Harness threads={[direct('c-1', 'peer-1')]} selfId="me" />);

    channelEvent('c-1', { conversationId: 'c-1', userId: 'peer-1', state: 'recording' });
    act(() => vi.advanceTimersByTime(5_000));
    expect(captured).toEqual({ 'c-1': 'recording' });

    act(() => vi.advanceTimersByTime(1_000));
    expect(captured).toEqual({});
  });

  it('ignores the wrong member’s claim', () => {
    render(<Harness threads={[direct('c-1', 'peer-1')]} selfId="me" />);

    channelEvent('c-1', { conversationId: 'c-1', userId: 'peer-3', state: 'typing' });

    expect(captured).toEqual({});
  });

  it('clears a row at once when the peer stops', () => {
    render(<Harness threads={[direct('c-1', 'peer-1')]} selfId="me" />);

    channelEvent('c-1', { conversationId: 'c-1', userId: 'peer-1', state: 'typing' });
    channelEvent('c-1', { conversationId: 'c-1', userId: 'peer-1', state: 'stop' });

    expect(captured).toEqual({});
  });

  it('releases a row’s channel when the row leaves the list, and leaves it after the window', () => {
    const view = render(
      <Harness threads={[direct('c-1', 'peer-1'), direct('c-2', 'peer-2')]} selfId="me" />
    );
    leave.mockReset();

    view.rerender(<Harness threads={[direct('c-1', 'peer-1')]} selfId="me" />);

    // Released, not closed: the thread that row opens is the next holder
    // (ADR-0171), and it reclaims the join inside the window.
    expect(leave).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(CHAT_PRESENCE_CHANNEL_GRACE_MS));
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('leaves every channel once the list has been gone for the window', () => {
    const view = render(
      <Harness threads={[direct('c-1', 'peer-1'), direct('c-2', 'peer-2')]} selfId="me" />
    );
    view.unmount();

    expect(leave).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(CHAT_PRESENCE_CHANNEL_GRACE_MS));
    expect(leave).toHaveBeenCalledTimes(2);
  });

  it('lets the thread a row opens reclaim that row’s join', () => {
    const list = render(<Harness threads={[direct('c-1', 'peer-1')]} selfId="me" />);
    list.unmount();
    act(() => vi.advanceTimersByTime(1_000));

    // The thread's own hook wants the same conversation, not a second join.
    render(<ThreadHarness selfId="me" />);

    expect(api.joinChatPresenceChannel).toHaveBeenCalledTimes(1);
    expect(leave).not.toHaveBeenCalled();
  });
});
