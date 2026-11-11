import { beforeEach, describe, expect, it, vi } from 'vitest';

const realtime = vi.hoisted(() => ({
  joinBroadcastChannel: vi.fn(),
  subscribeToPostgresChanges: vi.fn(),
}));

vi.mock('@/frontend/transport/supabase/realtime', () => realtime);
vi.mock('@/frontend/transport/http', () => ({ request: vi.fn() }));

import { joinChatPresenceReader, joinChatPresenceWriter } from '@/frontend/api/chats';

/** The channel the transport was asked to join, as the reader configured it. */
function joined() {
  return realtime.joinBroadcastChannel.mock.calls[0]?.[0] as {
    topic: string;
    handlers: Record<string, (payload: Record<string, unknown>) => void>;
  };
}

const send = vi.fn();
const leave = vi.fn();

describe('joinChatPresenceReader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtime.joinBroadcastChannel.mockReturnValue({ send, leave });
  });

  it('joins the member’s own stream, not a name of its own', () => {
    joinChatPresenceReader('me', vi.fn());

    expect(joined().topic).toBe('presence:me');
  });

  it('answers a peer event with the conversation it belongs to', () => {
    const onEvent = vi.fn();
    joinChatPresenceReader('me', onEvent);

    joined().handlers.presence?.({ conversationId: 'c-1', userId: 'peer-2', state: 'typing' });

    expect(onEvent).toHaveBeenCalledWith({
      conversationId: 'c-1',
      userId: 'peer-2',
      state: 'typing',
    });
  });

  it('ignores the caller’s own events and anything malformed', () => {
    const onEvent = vi.fn();
    joinChatPresenceReader('me', onEvent);

    joined().handlers.presence?.({ conversationId: 'c-1', userId: 'me', state: 'typing' });
    joined().handlers.presence?.({ conversationId: 'c-1', userId: 'peer-2' });
    joined().handlers.presence?.({ conversationId: '', userId: 'peer-2', state: 'typing' });
    joined().handlers.presence?.({ conversationId: 'c-1', userId: 42, state: 'typing' });
    joined().handlers.presence?.({ conversationId: 'c-1', userId: 'peer-2', state: 'idle' });

    expect(onEvent).not.toHaveBeenCalled();
  });
});

describe('joinChatPresenceWriter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtime.joinBroadcastChannel.mockReturnValue({ send, leave });
  });

  it('joins the peer’s stream, which only the write policy admits', () => {
    joinChatPresenceWriter('peer-2', 'me');

    expect(joined().topic).toBe('presence:peer-2');
    // No handlers: the writer must not read a stream it is not the recipient of.
    expect(joined().handlers).toEqual({});
  });

  it('announces the caller, the conversation and the state', () => {
    const channel = joinChatPresenceWriter('peer-2', 'me');

    channel.announce('c-1', 'typing');
    expect(send).toHaveBeenCalledWith('presence', {
      conversationId: 'c-1',
      userId: 'me',
      state: 'typing',
    });

    channel.announce('c-1', 'recording');
    expect(send).toHaveBeenCalledWith('presence', {
      conversationId: 'c-1',
      userId: 'me',
      state: 'recording',
    });
  });

  it('ends the state on request', () => {
    const channel = joinChatPresenceWriter('peer-2', 'me');

    channel.stop('c-1');
    expect(send).toHaveBeenCalledWith('presence', {
      conversationId: 'c-1',
      userId: 'me',
      state: 'stop',
    });
  });

  it('leaves exactly one channel', () => {
    joinChatPresenceWriter('peer-2', 'me').leave();

    expect(leave).toHaveBeenCalledTimes(1);
  });
});
