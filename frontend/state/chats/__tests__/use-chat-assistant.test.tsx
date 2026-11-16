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
  apps: { used: 0, cap: 0, connected: 0 },
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

  it('paints the question before the answer arrives', async () => {
    let release: (() => void) | null = null;
    api.streamChatAgentTurn.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );

    const { result } = renderHook(() => useChatAssistant('c-1', true, () => undefined));

    let asking!: Promise<boolean>;
    act(() => {
      asking = result.current.ask('كيف أبدأ؟', []);
    });

    // The line is already the member's, while the turn is still running.
    expect(result.current.pending?.message.body).toBe('كيف أبدأ؟');
    expect(result.current.pending?.status).toBe('sending');
    expect(result.current.isStreaming).toBe(true);

    await act(async () => {
      // Let the send reach the stream, then answer it.
      for (let tick = 0; tick < 5 && !release; tick += 1) await Promise.resolve();
      release?.();
      await asking;
    });
  });

  it('takes the stored row the turn hands back', async () => {
    const stored = {
      id: 'message-1',
      conversationId: 'c-1',
      senderId: 'user-1',
      senderKind: 'user' as const,
      body: 'كيف أبدأ؟',
      replyToId: null,
      editedAt: null,
      deletedAt: null,
      createdAt: '2026-11-09T10:00:00.000Z',
      attachments: [],
      replyTo: null,
    };
    api.streamChatAgentTurn.mockImplementation(
      async (_id: string, _body: string, onEvent: (event: unknown) => void) => {
        onEvent({ type: 'question', message: stored });
      }
    );

    const { result } = renderHook(() => useChatAssistant('c-1', true, () => undefined));
    await act(async () => {
      await result.current.ask('كيف أبدأ؟', []);
    });

    expect(result.current.pending?.stored).toBe(true);
    expect(result.current.pending?.message.id).toBe('message-1');
  });

  it('keeps a question the server never wrote, and sends it again', async () => {
    api.streamChatAgentTurn.mockRejectedValue(new Error('انقطع الاتصال'));

    const { result } = renderHook(() => useChatAssistant('c-1', true, () => undefined));
    await act(async () => {
      await result.current.ask('سؤال', []);
    });

    expect(result.current.pending?.status).toBe('failed');
    expect(api.streamChatAgentTurn).toHaveBeenCalledTimes(1);

    api.streamChatAgentTurn.mockImplementation(
      async (_id: string, _body: string, onEvent: (event: unknown) => void) => {
        onEvent({
          type: 'question',
          message: {
            id: 'message-2',
            conversationId: 'c-1',
            senderId: 'user-1',
            senderKind: 'user',
            body: 'سؤال',
            replyToId: null,
            editedAt: null,
            deletedAt: null,
            createdAt: '2026-11-09T10:00:00.000Z',
            attachments: [],
            replyTo: null,
          },
        });
      }
    );

    await act(async () => {
      result.current.retryPending();
    });

    expect(api.streamChatAgentTurn).toHaveBeenCalledTimes(2);
    expect(result.current.pending?.message.id).toBe('message-2');
  });
});
