import { beforeEach, describe, expect, it, vi } from 'vitest';

const realtime = vi.hoisted(() => ({
  joinBroadcastChannel: vi.fn(),
  subscribeToPostgresChanges: vi.fn(),
}));

vi.mock('@/frontend/transport/supabase/realtime', () => realtime);
vi.mock('@/frontend/transport/http', () => ({ request: vi.fn() }));

import { joinChatTyping } from '@/frontend/api/chats';

/** The channel the transport was asked to join, as `joinChatTyping` configured it. */
function joined() {
  return realtime.joinBroadcastChannel.mock.calls[0]?.[0] as {
    topic: string;
    handlers: Record<string, (payload: Record<string, unknown>) => void>;
  };
}

describe('joinChatTyping', () => {
  const send = vi.fn();
  const leave = vi.fn();
  const onTyping = vi.fn();
  const onStop = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    realtime.joinBroadcastChannel.mockReturnValue({ send, leave });
  });

  it('joins the conversation topic, not a name of its own', () => {
    joinChatTyping('c-1', 'me', { onTyping, onStop });

    expect(joined().topic).toBe('chat:c-1');
  });

  it('broadcasts the caller as the writer, and a stop on request', () => {
    const channel = joinChatTyping('c-1', 'me', { onTyping, onStop });

    channel.typing();
    expect(send).toHaveBeenCalledWith('typing', { userId: 'me' });

    channel.stop();
    expect(send).toHaveBeenCalledWith('stop', { userId: 'me' });

    channel.leave();
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('answers a peer’s typing with their id', () => {
    joinChatTyping('c-1', 'me', { onTyping, onStop });

    joined().handlers.typing?.({ userId: 'peer-2' });
    expect(onTyping).toHaveBeenCalledWith('peer-2');

    joined().handlers.stop?.({ userId: 'peer-2' });
    expect(onStop).toHaveBeenCalledWith('peer-2');
  });

  it('ignores the caller’s own events and one with no identity', () => {
    joinChatTyping('c-1', 'me', { onTyping, onStop });

    joined().handlers.typing?.({ userId: 'me' });
    joined().handlers.typing?.({});
    joined().handlers.typing?.({ userId: 42 });
    joined().handlers.stop?.({ userId: 'me' });

    expect(onTyping).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
  });
});
