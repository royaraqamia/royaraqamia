import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useEffect } from 'react';

const api = vi.hoisted(() => ({
  joinChatPresenceReader: vi.fn(),
  joinChatPresenceWriter: vi.fn(),
}));

vi.mock('@/frontend/api/chats', () => api);

import { useChatPresence, type ChatPresenceHook } from '@/frontend/state/chats/use-chat-presence';
import type { ChatPresenceEvent } from '@/shared/contracts/chat';

let captured: ChatPresenceHook | null = null;

function Harness({ selfId, peerId }: { selfId: string | null; peerId: string | null }) {
  const state = useChatPresence('c-1', selfId, peerId);
  useEffect(() => {
    captured = state;
  });
  return null;
}

const announce = vi.fn();
const stop = vi.fn();
const leaveWriter = vi.fn();
const leaveReader = vi.fn();

/** The callback the reader channel was given, as the topic would call it. */
function readerEvent(event: ChatPresenceEvent) {
  const onEvent = api.joinChatPresenceReader.mock.calls[0]?.[1] as
    ((event: ChatPresenceEvent) => void) | undefined;
  act(() => onEvent?.(event));
}

describe('useChatPresence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    captured = null;
    api.joinChatPresenceReader.mockReset().mockReturnValue({ leave: leaveReader });
    api.joinChatPresenceWriter.mockReset().mockReturnValue({ announce, stop, leave: leaveWriter });
    announce.mockReset();
    stop.mockReset();
    leaveReader.mockReset();
    leaveWriter.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('joins the member’s stream and the peer’s write-only stream', () => {
    render(<Harness selfId="me" peerId="peer-2" />);

    expect(api.joinChatPresenceReader).toHaveBeenCalledWith('me', expect.any(Function));
    expect(api.joinChatPresenceWriter).toHaveBeenCalledWith('peer-2', 'me');
  });

  it('joins nothing while nobody is signed in, or a thread has no peer', () => {
    render(<Harness selfId={null} peerId="peer-2" />);
    render(<Harness selfId="me" peerId={null} />);

    expect(api.joinChatPresenceReader).not.toHaveBeenCalled();
    expect(api.joinChatPresenceWriter).not.toHaveBeenCalled();
  });

  it('draws a typist and clears them five seconds after the last event', () => {
    render(<Harness selfId="me" peerId="peer-2" />);

    readerEvent({ conversationId: 'c-1', userId: 'peer-2', state: 'typing' });
    expect(captured!.peer).toBe('typing');

    act(() => vi.advanceTimersByTime(5_000));
    expect(captured!.peer).toBeNull();
  });

  it('keeps a recording for six seconds, wider than its heartbeat', () => {
    render(<Harness selfId="me" peerId="peer-2" />);

    readerEvent({ conversationId: 'c-1', userId: 'peer-2', state: 'recording' });
    act(() => vi.advanceTimersByTime(5_000));
    expect(captured!.peer).toBe('recording');

    act(() => vi.advanceTimersByTime(1_000));
    expect(captured!.peer).toBeNull();
  });

  it('clears at once when the peer stops', () => {
    render(<Harness selfId="me" peerId="peer-2" />);

    readerEvent({ conversationId: 'c-1', userId: 'peer-2', state: 'typing' });
    readerEvent({ conversationId: 'c-1', userId: 'peer-2', state: 'stop' });

    expect(captured!.peer).toBeNull();
  });

  it('ignores another thread’s event and another member’s claim', () => {
    render(<Harness selfId="me" peerId="peer-2" />);

    readerEvent({ conversationId: 'c-2', userId: 'peer-2', state: 'typing' });
    readerEvent({ conversationId: 'c-1', userId: 'peer-3', state: 'recording' });

    expect(captured!.peer).toBeNull();
  });

  it('broadcasts the first keystroke, then at most once per window', () => {
    render(<Harness selfId="me" peerId="peer-2" />);

    act(() => captured!.noteTyping());
    act(() => captured!.noteTyping());
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenLastCalledWith('c-1', 'typing');

    act(() => vi.advanceTimersByTime(4_000));
    act(() => captured!.noteTyping());
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('announces a recording, heartbeats it, and outranks typing', () => {
    render(<Harness selfId="me" peerId="peer-2" />);

    act(() => captured!.noteRecording(true));
    expect(announce).toHaveBeenLastCalledWith('c-1', 'recording');

    act(() => captured!.noteTyping());
    expect(announce).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(4_000));
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenLastCalledWith('c-1', 'recording');

    act(() => captured!.noteRecording(false));
    expect(stop).toHaveBeenCalledWith('c-1');

    act(() => vi.advanceTimersByTime(4_000));
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('says the writer stopped on request, and the next keystroke goes at once', () => {
    render(<Harness selfId="me" peerId="peer-2" />);

    act(() => captured!.noteTyping());
    act(() => captured!.stopTyping());
    expect(stop).toHaveBeenCalledWith('c-1');

    act(() => captured!.noteTyping());
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('leaves both channels when the thread closes', () => {
    const view = render(<Harness selfId="me" peerId="peer-2" />);
    view.unmount();

    expect(leaveReader).toHaveBeenCalledTimes(1);
    expect(leaveWriter).toHaveBeenCalledTimes(1);
  });
});
