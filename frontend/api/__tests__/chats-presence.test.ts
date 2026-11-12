import { beforeEach, describe, expect, it, vi } from 'vitest';

const realtime = vi.hoisted(() => ({
  joinBroadcastChannel: vi.fn(),
  subscribeToPostgresChanges: vi.fn(),
}));

vi.mock('@/frontend/transport/supabase/realtime', () => realtime);
vi.mock('@/frontend/transport/http', () => ({ request: vi.fn() }));

import { joinChatPresenceChannel } from '@/frontend/api/chats';

/** The channel the transport was asked to join, as the conversation configured it. */
function joined() {
  return realtime.joinBroadcastChannel.mock.calls[0]?.[0] as {
    topic: string;
    handlers: Record<string, (payload: Record<string, unknown>) => void>;
  };
}

const send = vi.fn();
const leave = vi.fn();

describe('joinChatPresenceChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtime.joinBroadcastChannel.mockReturnValue({ send, leave });
  });

  it('joins the conversation’s own topic, not a member’s', () => {
    joinChatPresenceChannel('c-1', 'me', vi.fn());

    expect(joined().topic).toBe('presence:c-1');
  });

  it('answers a peer event with the conversation it belongs to', () => {
    const onEvent = vi.fn();
    joinChatPresenceChannel('c-1', 'me', onEvent);

    joined().handlers.presence?.({ conversationId: 'c-1', userId: 'peer-2', state: 'typing' });

    expect(onEvent).toHaveBeenCalledWith({
      conversationId: 'c-1',
      userId: 'peer-2',
      state: 'typing',
    });
  });

  it('ignores the caller’s own events, another thread’s and anything malformed', () => {
    const onEvent = vi.fn();
    joinChatPresenceChannel('c-1', 'me', onEvent);

    joined().handlers.presence?.({ conversationId: 'c-1', userId: 'me', state: 'typing' });
    joined().handlers.presence?.({ conversationId: 'c-2', userId: 'peer-2', state: 'typing' });
    joined().handlers.presence?.({ conversationId: 'c-1', userId: 'peer-2' });
    joined().handlers.presence?.({ conversationId: '', userId: 'peer-2', state: 'typing' });
    joined().handlers.presence?.({ conversationId: 'c-1', userId: 42, state: 'typing' });
    joined().handlers.presence?.({ conversationId: 'c-1', userId: 'peer-2', state: 'idle' });

    expect(onEvent).not.toHaveBeenCalled();
  });

  it('announces the caller, the conversation and the state', () => {
    const channel = joinChatPresenceChannel('c-1', 'me', vi.fn());

    channel.announce('typing');
    expect(send).toHaveBeenCalledWith('presence', {
      conversationId: 'c-1',
      userId: 'me',
      state: 'typing',
    });

    channel.announce('recording');
    expect(send).toHaveBeenCalledWith('presence', {
      conversationId: 'c-1',
      userId: 'me',
      state: 'recording',
    });
  });

  it('ends the state on request', () => {
    const channel = joinChatPresenceChannel('c-1', 'me', vi.fn());

    channel.stop();
    expect(send).toHaveBeenCalledWith('presence', {
      conversationId: 'c-1',
      userId: 'me',
      state: 'stop',
    });
  });

  it('leaves exactly one channel', () => {
    joinChatPresenceChannel('c-1', 'me', vi.fn()).leave();

    expect(leave).toHaveBeenCalledTimes(1);
  });
});
