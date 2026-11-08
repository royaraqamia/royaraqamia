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

const transport = vi.hoisted(() => ({
  uploadChatAttachment: vi.fn(),
  removeChatAttachmentObjects: vi.fn(),
}));

vi.mock('@/frontend/transport/supabase/chat-attachments', () => transport);

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
    transport.uploadChatAttachment.mockReset();
    transport.removeChatAttachmentObjects.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * A picture has to be in the bucket before the turn names it: the route reads
   * the bytes back and hands them to the model as an image part (ADR-0139), so
   * the upload is what makes the turn possible at all — and the metadata it
   * returns is what the route is given.
   */
  it('uploads the picture before the turn, and sends what the upload returned', async () => {
    const order: string[] = [];
    const uploaded = {
      storagePath: 'c-1/uuid/shot.webp',
      fileName: 'shot.webp',
      mimeType: 'image/webp',
      byteSize: 12_345,
    };
    transport.uploadChatAttachment.mockImplementation(async () => {
      order.push('upload');
      return uploaded;
    });
    api.streamChatAgentTurn.mockImplementation(
      async (
        _id: string,
        _body: string,
        _onEvent: (event: unknown) => void,
        attachments: unknown[]
      ) => {
        order.push('stream');
        expect(attachments).toEqual([uploaded]);
      }
    );

    const { result } = renderHook(() => useChatAssistant('c-1', true, () => undefined));
    const file = new File(['bytes'], 'shot.png', { type: 'image/png' });

    await act(async () => {
      await result.current.ask('', [file]);
    });

    expect(order).toEqual(['upload', 'stream']);
    expect(transport.uploadChatAttachment).toHaveBeenCalledWith('c-1', file);
    expect(result.current.error).toBeNull();
  });

  it('takes the uploaded objects back when the turn is refused', async () => {
    const uploaded = {
      storagePath: 'c-1/uuid/shot.webp',
      fileName: 'shot.webp',
      mimeType: 'image/webp',
      byteSize: 12_345,
    };
    transport.uploadChatAttachment.mockResolvedValue(uploaded);
    api.streamChatAgentTurn.mockRejectedValue(new Error('ثلاث صور في السؤال الواحد'));

    const { result } = renderHook(() => useChatAssistant('c-1', true, () => undefined));

    await act(async () => {
      await result.current.ask('', [new File(['bytes'], 'shot.png', { type: 'image/png' })]);
    });

    expect(transport.removeChatAttachmentObjects).toHaveBeenCalledWith([uploaded.storagePath]);
    expect(result.current.error).toBe('ثلاث صور في السؤال الواحد');
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
