import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useEffect } from 'react';

const api = vi.hoisted(() => ({ joinChatPresenceReader: vi.fn() }));

vi.mock('@/frontend/api/chats', () => api);

import {
  useChatPresenceList,
  type ChatPresenceMap,
} from '@/frontend/state/chats/use-chat-presence-list';
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

/** The callback the member's own stream was given. */
function readerEvent(event: ChatPresenceEvent) {
  const onEvent = api.joinChatPresenceReader.mock.calls[0]?.[1] as
    ((event: ChatPresenceEvent) => void) | undefined;
  act(() => onEvent?.(event));
}

describe('useChatPresenceList', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    captured = {};
    api.joinChatPresenceReader.mockReset().mockReturnValue({ leave });
    leave.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('joins the member’s own stream once, whatever the list holds', () => {
    render(<Harness threads={[direct('c-1', 'peer-1'), direct('c-2', 'peer-2')]} selfId="me" />);

    expect(api.joinChatPresenceReader).toHaveBeenCalledTimes(1);
    expect(api.joinChatPresenceReader).toHaveBeenCalledWith('me', expect.any(Function));
  });

  it('joins nothing while nobody is signed in', () => {
    render(<Harness threads={[direct('c-1', 'peer-1')]} selfId={null} />);

    expect(api.joinChatPresenceReader).not.toHaveBeenCalled();
  });

  it('draws the thread a peer event names, and expires it', () => {
    render(<Harness threads={[direct('c-1', 'peer-1')]} selfId="me" />);

    readerEvent({ conversationId: 'c-1', userId: 'peer-1', state: 'typing' });
    expect(captured).toEqual({ 'c-1': 'typing' });

    act(() => vi.advanceTimersByTime(5_000));
    expect(captured).toEqual({});
  });

  it('keeps a recording for its wider window', () => {
    render(<Harness threads={[direct('c-1', 'peer-1')]} selfId="me" />);

    readerEvent({ conversationId: 'c-1', userId: 'peer-1', state: 'recording' });
    act(() => vi.advanceTimersByTime(5_000));
    expect(captured).toEqual({ 'c-1': 'recording' });

    act(() => vi.advanceTimersByTime(1_000));
    expect(captured).toEqual({});
  });

  it('ignores a group, a thread it does not hold, and the wrong member', () => {
    render(<Harness threads={[direct('c-1', 'peer-1'), GROUP]} selfId="me" />);

    readerEvent({ conversationId: 'g-1', userId: 'peer-1', state: 'typing' });
    readerEvent({ conversationId: 'c-9', userId: 'peer-1', state: 'typing' });
    readerEvent({ conversationId: 'c-1', userId: 'peer-3', state: 'typing' });

    expect(captured).toEqual({});
  });

  it('clears a row at once when the peer stops', () => {
    render(<Harness threads={[direct('c-1', 'peer-1')]} selfId="me" />);

    readerEvent({ conversationId: 'c-1', userId: 'peer-1', state: 'typing' });
    readerEvent({ conversationId: 'c-1', userId: 'peer-1', state: 'stop' });

    expect(captured).toEqual({});
  });

  it('leaves the stream when the list closes', () => {
    const view = render(<Harness threads={[direct('c-1', 'peer-1')]} selfId="me" />);
    view.unmount();

    expect(leave).toHaveBeenCalledTimes(1);
  });
});
