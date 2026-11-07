import { describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ sendChatMessage: vi.fn() }));

vi.mock('@/frontend/api/chats', () => ({ sendChatMessage: api.sendChatMessage }));

import { createChatHttpSyncTransport } from '@/frontend/api/chats/sync-transport';
import type { ChatsLocalStore } from '@/frontend/api/chats/local-store';
import { ApiError } from '@/frontend/transport/http';
import { classifySyncError } from '@/frontend/shared/local-store/sync-transport';
import type { OutboxEntry } from '@/frontend/shared/local-store/outbox';

const clientId = '11111111-1111-7111-8111-111111111111';

function entry(): OutboxEntry {
  return {
    seq: 1,
    id: 'e-1',
    entity: 'chat_message',
    type: 'message.send',
    payload: { conversationId: 'c-1', body: 'مرحبا', clientId },
    createdAt: 0,
    attempts: 0,
    status: 'pending',
    lastError: null,
    nextAttemptAt: 0,
  };
}

function store() {
  return { applyServerMessage: vi.fn(async () => undefined) } as unknown as ChatsLocalStore;
}

const message = {
  id: 'm-1',
  conversationId: 'c-1',
  senderId: 'u-1',
  senderKind: 'user' as const,
  body: 'مرحبا',
  replyToId: null,
  editedAt: null,
  deletedAt: null,
  createdAt: '2026-11-01T10:05:00.000Z',
  clientId,
  attachments: [],
  replyTo: null,
};

describe('createChatHttpSyncTransport', () => {
  it('replays the queued line with its client id and records the server row', async () => {
    api.sendChatMessage.mockReset().mockResolvedValue({ success: true, message });
    const local = store();

    await createChatHttpSyncTransport(local).send(entry());

    expect(api.sendChatMessage).toHaveBeenCalledWith('c-1', { body: 'مرحبا', clientId });
    expect(local.applyServerMessage).toHaveBeenCalledWith(message);
  });

  it('gives up on a refusal the member has to answer', async () => {
    api.sendChatMessage
      .mockReset()
      .mockRejectedValue(new ApiError('حظرك هذا العضو، لا يمكن إرسال رسائل بينكما', 403));

    const failure = await createChatHttpSyncTransport(store())
      .send(entry())
      .catch((error: unknown) => error);

    expect(classifySyncError(failure)).toBe('permanent');
  });

  it('retries a rate limit instead of failing the line', async () => {
    api.sendChatMessage
      .mockReset()
      .mockRejectedValue(new ApiError('تم تجاوز الحد: الرسائل محدودة', 429));

    const failure = await createChatHttpSyncTransport(store())
      .send(entry())
      .catch((error: unknown) => error);

    expect(classifySyncError(failure)).toBe('transient');
  });

  it('treats a closed thread as a refusal, not a clash to retry', async () => {
    api.sendChatMessage
      .mockReset()
      .mockRejectedValue(new ApiError('هذه المحادثة ليست مفتوحة', 409));

    const failure = await createChatHttpTransportFailure();

    expect(classifySyncError(failure)).toBe('permanent');
  });

  it('names a body that answered without a message', async () => {
    api.sendChatMessage.mockReset().mockResolvedValue({ success: false, error: 'تعذّر الإرسال' });

    const failure = await createChatHttpTransportFailure();

    expect(classifySyncError(failure)).toBe('permanent');
    expect((failure as Error).message).toBe('تعذّر الإرسال');
  });
});

function createChatHttpTransportFailure(): Promise<unknown> {
  return createChatHttpSyncTransport(store())
    .send(entry())
    .then(
      () => null,
      (error: unknown) => error
    );
}
