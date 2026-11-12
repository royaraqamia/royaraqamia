import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useEffect } from 'react';

const api = vi.hoisted(() => ({
  joinChatPresenceChannel: vi.fn(),
}));

vi.mock('@/frontend/api/chats', () => api);

import { useChatPresence, type ChatPresenceHook } from '@/frontend/state/chats/use-chat-presence';
import {
  CHAT_PRESENCE_CHANNEL_GRACE_MS,
  closeAllChatPresence,
} from '@/frontend/state/chats/presence-channels';
import type { ChatPresenceEvent } from '@/shared/contracts/chat';

let captured: ChatPresenceHook | null = null;

function Harness({ selfId }: { selfId: string | null }) {
  const state = useChatPresence('c-1', selfId);
  useEffect(() => {
    captured = state;
  });
  return null;
}

const announce = vi.fn();
const stop = vi.fn();
const leave = vi.fn();

/** The callback the conversation's channel was given, as the topic would call it. */
function channelEvent(event: ChatPresenceEvent) {
  const onEvent = api.joinChatPresenceChannel.mock.calls[0]?.[2] as
    ((event: ChatPresenceEvent) => void) | undefined;
  act(() => onEvent?.(event));
}

describe('useChatPresence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    captured = null;
    // The registry is module state: a topic a previous test left waiting must
    // not be the one this test joins.
    closeAllChatPresence();
    api.joinChatPresenceChannel.mockReset().mockReturnValue({ announce, stop, leave });
    announce.mockReset();
    stop.mockReset();
    leave.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('joins the conversation’s topic, not a member’s stream', () => {
    render(<Harness selfId="me" />);

    expect(api.joinChatPresenceChannel).toHaveBeenCalledWith('c-1', 'me', expect.any(Function));
  });

  it('joins nothing while nobody is signed in', () => {
    render(<Harness selfId={null} />);

    expect(api.joinChatPresenceChannel).not.toHaveBeenCalled();
  });

  it('draws a typist and clears them five seconds after the last event', () => {
    render(<Harness selfId="me" />);

    channelEvent({ conversationId: 'c-1', userId: 'peer-2', state: 'typing' });
    expect(captured!.peer).toBe('typing');

    act(() => vi.advanceTimersByTime(5_000));
    expect(captured!.peer).toBeNull();
  });

  it('keeps a recording for six seconds, wider than its heartbeat', () => {
    render(<Harness selfId="me" />);

    channelEvent({ conversationId: 'c-1', userId: 'peer-2', state: 'recording' });
    act(() => vi.advanceTimersByTime(5_000));
    expect(captured!.peer).toBe('recording');

    act(() => vi.advanceTimersByTime(1_000));
    expect(captured!.peer).toBeNull();
  });

  it('clears at once when the peer stops', () => {
    render(<Harness selfId="me" />);

    channelEvent({ conversationId: 'c-1', userId: 'peer-2', state: 'typing' });
    channelEvent({ conversationId: 'c-1', userId: 'peer-2', state: 'stop' });

    expect(captured!.peer).toBeNull();
  });

  it('draws only the conversation’s own events', () => {
    render(<Harness selfId="me" />);

    channelEvent({ conversationId: 'c-1', userId: 'peer-2', state: 'typing' });
    expect(captured!.peer).toBe('typing');
  });

  it('broadcasts the first keystroke, then at most once per window', () => {
    render(<Harness selfId="me" />);

    act(() => captured!.noteTyping());
    act(() => captured!.noteTyping());
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenLastCalledWith('typing');

    act(() => vi.advanceTimersByTime(4_000));
    act(() => captured!.noteTyping());
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('announces a recording, heartbeats it, and outranks typing', () => {
    render(<Harness selfId="me" />);

    act(() => captured!.noteRecording(true));
    expect(announce).toHaveBeenLastCalledWith('recording');

    act(() => captured!.noteTyping());
    expect(announce).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(4_000));
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenLastCalledWith('recording');

    act(() => captured!.noteRecording(false));
    expect(stop).toHaveBeenCalledWith();

    act(() => vi.advanceTimersByTime(4_000));
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('says the state stopped on request, and the next keystroke goes at once', () => {
    render(<Harness selfId="me" />);

    act(() => captured!.noteTyping());
    act(() => captured!.stopTyping());
    expect(stop).toHaveBeenCalledWith();

    act(() => captured!.noteTyping());
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('holds the topic through the grace window after the thread closes', () => {
    const view = render(<Harness selfId="me" />);
    view.unmount();

    // The list's row and this thread are two screens on one topic (ADR-0171),
    // so closing one must not close the join the other may still want.
    expect(leave).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(CHAT_PRESENCE_CHANNEL_GRACE_MS));
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('reclaims a topic another screen joined, instead of joining it twice', () => {
    const first = render(<Harness selfId="me" />);
    render(<Harness selfId="me" />);

    expect(api.joinChatPresenceChannel).toHaveBeenCalledTimes(1);

    first.unmount();
    expect(leave).not.toHaveBeenCalled();
  });

  it('reclaims a topic the previous screen left inside the window', () => {
    const first = render(<Harness selfId="me" />);
    first.unmount();
    act(() => vi.advanceTimersByTime(CHAT_PRESENCE_CHANNEL_GRACE_MS - 1_000));

    render(<Harness selfId="me" />);

    expect(api.joinChatPresenceChannel).toHaveBeenCalledTimes(1);
    expect(leave).not.toHaveBeenCalled();
  });

  it('closes every topic when the session ends, rather than waiting out the window', () => {
    render(<Harness selfId="me" />);

    act(() => closeAllChatPresence());

    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('joins a different member a fresh channel instead of sharing one', () => {
    const view = render(<Harness selfId="me" />);
    view.rerender(<Harness selfId="other" />);

    expect(api.joinChatPresenceChannel).toHaveBeenCalledTimes(2);
    expect(api.joinChatPresenceChannel).toHaveBeenLastCalledWith(
      'c-1',
      'other',
      expect.any(Function)
    );
    expect(leave).toHaveBeenCalledTimes(1);
  });
});
