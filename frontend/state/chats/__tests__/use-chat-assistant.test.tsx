import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const api = vi.hoisted(() => ({
  getChatAssistant: vi.fn(),
  streamChatAgentTurn: vi.fn(),
}));

vi.mock('@/frontend/api/chats', () => ({
  getChatAssistant: api.getChatAssistant,
  streamChatAgentTurn: api.streamChatAgentTurn,
}));

const { useChatAssistant } = await import('@/frontend/state/chats/use-chat-assistant');

const ALLOWANCE = {
  plan: 'pro' as const,
  member: { used: 1, cap: 40 },
  project: { used: 2, limit: 200 },
  resetsAt: '2026-11-03T00:00:00.000Z',
};

describe('useChatAssistant', () => {
  beforeEach(() => {
    api.getChatAssistant.mockReset();
    api.streamChatAgentTurn.mockReset();
    api.getChatAssistant.mockResolvedValue({ available: true, allowance: ALLOWANCE });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the text that arrived before a turn failed', async () => {
    api.streamChatAgentTurn.mockImplementation(
      async (_id: string, _body: string, onEvent: (event: unknown) => void) => {
        onEvent({ type: 'delta', text: 'بدأت أشرح' });
        onEvent({ type: 'error', error: 'المساعد مشغول الآن، حاول بعد قليل.' });
      }
    );

    const { result } = renderHook(() => useChatAssistant('c-1', true, () => undefined));

    await act(async () => {
      await result.current.ask('سؤال', []);
    });

    expect(result.current.interrupted).toBe('بدأت أشرح');
    expect(result.current.streamingText).toBe('');
    expect(result.current.error).toBe('المساعد مشغول الآن، حاول بعد قليل.');
  });

  it('drops it when the next turn starts', async () => {
    api.streamChatAgentTurn.mockImplementation(
      async (_id: string, _body: string, onEvent: (event: unknown) => void) => {
        onEvent({ type: 'delta', text: 'نصف رد' });
        onEvent({ type: 'error', error: 'انقطع' });
      }
    );

    const { result } = renderHook(() => useChatAssistant('c-1', true, () => undefined));
    await act(async () => {
      await result.current.ask('سؤال', []);
    });
    expect(result.current.interrupted).toBe('نصف رد');

    api.streamChatAgentTurn.mockImplementation(async () => undefined);
    await act(async () => {
      await result.current.ask('سؤال آخر', []);
    });

    expect(result.current.interrupted).toBe('');
    expect(result.current.error).toBeNull();
  });
});
