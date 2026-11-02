import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useEffect } from 'react';

const api = vi.hoisted(() => ({ joinChatTyping: vi.fn() }));

vi.mock('@/frontend/api/chats', () => ({ joinChatTyping: api.joinChatTyping }));

import { useChatTyping, type ChatTypingState } from '@/frontend/state/chats/use-chat-typing';

let captured: ChatTypingState | null = null;

function Harness({ selfId }: { selfId: string | null }) {
  const state = useChatTyping('c-1', selfId);
  useEffect(() => {
    captured = state;
  });
  return null;
}

const typing = vi.fn();
const stop = vi.fn();
const leave = vi.fn();

/** The handlers `joinChatTyping` was given, as the channel would call them. */
function channelHandlers() {
  return api.joinChatTyping.mock.calls[0]?.[2] as {
    onTyping: (userId: string) => void;
    onStop: (userId: string) => void;
  };
}

describe('useChatTyping', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    captured = null;
    api.joinChatTyping.mockReset().mockReturnValue({ typing, stop, leave });
    typing.mockReset();
    stop.mockReset();
    leave.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('joins the thread’s channel for the signed-in member', () => {
    render(<Harness selfId="me" />);

    expect(api.joinChatTyping).toHaveBeenCalledWith('c-1', 'me', expect.any(Object));
  });

  it('joins nothing while nobody is signed in', () => {
    render(<Harness selfId={null} />);

    expect(api.joinChatTyping).not.toHaveBeenCalled();
  });

  it('draws a writer and clears them five seconds after their last event', () => {
    render(<Harness selfId="me" />);

    act(() => channelHandlers().onTyping('peer-2'));
    expect(captured!.typers).toEqual(['peer-2']);

    // A second event restarts the window rather than racing the first one.
    act(() => vi.advanceTimersByTime(4_000));
    act(() => channelHandlers().onTyping('peer-2'));
    act(() => vi.advanceTimersByTime(4_000));
    expect(captured!.typers).toEqual(['peer-2']);

    act(() => vi.advanceTimersByTime(1_000));
    expect(captured!.typers).toEqual([]);
  });

  it('clears the writer at once when they stop', () => {
    render(<Harness selfId="me" />);

    act(() => channelHandlers().onTyping('peer-2'));
    act(() => channelHandlers().onStop('peer-2'));

    expect(captured!.typers).toEqual([]);
  });

  it('broadcasts the first keystroke, then at most once per window', () => {
    render(<Harness selfId="me" />);

    act(() => captured!.noteTyping());
    act(() => captured!.noteTyping());
    expect(typing).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(4_000));
    act(() => captured!.noteTyping());
    expect(typing).toHaveBeenCalledTimes(2);
  });

  it('says the writer stopped on request, and the next keystroke goes at once', () => {
    render(<Harness selfId="me" />);

    act(() => captured!.noteTyping());
    act(() => captured!.stopTyping());
    expect(stop).toHaveBeenCalledTimes(1);

    act(() => captured!.noteTyping());
    expect(typing).toHaveBeenCalledTimes(2);
  });

  it('leaves the channel when the thread closes', () => {
    const view = render(<Harness selfId="me" />);
    view.unmount();

    expect(leave).toHaveBeenCalledTimes(1);
  });
});
