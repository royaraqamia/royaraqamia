import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { useEffect } from 'react';

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  subscribe: vi.fn((_options: unknown) => () => {}),
  onChange: vi.fn(),
}));

vi.mock('@/frontend/api/chats', () => ({ getChatUnreadCount: mocks.count }));
vi.mock('@/frontend/transport/supabase/realtime', () => ({
  subscribeToPostgresChanges: mocks.subscribe,
}));

import { useChatUnreadCount } from '@/frontend/state/chats/use-chat-unread-count';

let seen = 0;

function Harness({ enabled }: { enabled: boolean }) {
  const count = useChatUnreadCount(enabled, enabled ? 'u-1' : null);
  useEffect(() => {
    seen = count;
  }, [count]);
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  seen = 0;
  mocks.count.mockResolvedValue(3);
  mocks.subscribe.mockImplementation(() => {
    const handlers = {
      onInsert: mocks.onChange,
      onUpdate: mocks.onChange,
      onDelete: mocks.onChange,
    };
    return () => void handlers;
  });
});

describe('useChatUnreadCount', () => {
  it('reads one aggregate and never opens the list', async () => {
    render(<Harness enabled />);
    await waitFor(() => expect(seen).toBe(3));

    expect(mocks.count).toHaveBeenCalledTimes(1);
    expect(mocks.subscribe).toHaveBeenCalledTimes(2);
  });

  it('refreshes only when a chat row actually changes', async () => {
    render(<Harness enabled />);
    await waitFor(() => expect(seen).toBe(3));

    const messages = mocks.subscribe.mock.calls[0]![0] as {
      handlers: { onInsert: () => void };
    };
    await act(async () => {
      messages.handlers.onInsert();
    });

    await waitFor(() => expect(mocks.count).toHaveBeenCalledTimes(2));
  });

  it('keeps a failed aggregate off the badge rather than claiming zero', async () => {
    mocks.count.mockRejectedValueOnce(new Error('offline'));

    render(<Harness enabled />);
    await waitFor(() => expect(mocks.count).toHaveBeenCalledTimes(1));

    expect(seen).toBe(0);
  });

  it('does nothing for a guest', async () => {
    render(<Harness enabled={false} />);
    await waitFor(() => expect(seen).toBe(0));

    expect(mocks.count).not.toHaveBeenCalled();
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });
});
