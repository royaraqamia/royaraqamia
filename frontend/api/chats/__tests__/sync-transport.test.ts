import { describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ sendChatMessage: vi.fn() }));
const uploads = vi.hoisted(() => ({ uploadChatAttachmentBlob: vi.fn() }));

vi.mock('@/frontend/api/chats', () => ({ sendChatMessage: api.sendChatMessage }));
vi.mock('@/frontend/transport/supabase/chat-attachments', () => ({
  uploadChatAttachmentBlob: uploads.uploadChatAttachmentBlob,
}));

import { createChatHttpSyncTransport } from '@/frontend/api/chats/sync-transport';
import type { ChatsLocalStore, ChatSendAttachment } from '@/frontend/api/chats/local-store';
import { ApiError } from '@/frontend/transport/http';
import { classifySyncError } from '@/frontend/shared/local-store/sync-transport';
import type { OutboxEntry } from '@/frontend/shared/local-store/outbox';

const clientId = '11111111-1111-7111-8111-111111111111';

function entry(attachments?: ChatSendAttachment[]): OutboxEntry {
  return {
    seq: 1,
    id: 'e-1',
    entity: 'chat_message',
    type: 'message.send',
    payload: { conversationId: 'c-1', body: 'مرحبا', clientId, attachments },
    createdAt: 0,
    attempts: 0,
    status: 'pending',
    lastError: null,
    nextAttemptAt: 0,
  };
}

function store() {
  return {
    applyServerMessage: vi.fn(async () => undefined),
    getMedia: vi.fn(async () => new Blob(['abc'])),
    recordAttachmentUpload: vi.fn(async () => undefined),
  } as unknown as ChatsLocalStore;
}

const uploaded = {
  storagePath: 'c-1/u-1/a.pdf',
  fileName: 'a.pdf',
  mimeType: 'application/pdf',
  byteSize: 3,
};

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

const file: ChatSendAttachment = {
  key: `out:${clientId}:0`,
  fileName: 'a.pdf',
  mimeType: 'application/pdf',
  byteSize: 3,
};

describe('createChatHttpSyncTransport', () => {
  it('replays the queued line with its client id and records the server row', async () => {
    api.sendChatMessage.mockReset().mockResolvedValue({ success: true, message });
    const local = store();

    await createChatHttpSyncTransport(local).send(entry());

    expect(api.sendChatMessage).toHaveBeenCalledWith('c-1', { body: 'مرحبا', clientId });
    expect(local.applyServerMessage).toHaveBeenCalledWith(message);
  });

  it('uploads a queued file before the message, and records where it landed', async () => {
    api.sendChatMessage.mockReset().mockResolvedValue({ success: true, message });
    uploads.uploadChatAttachmentBlob.mockReset().mockResolvedValue(uploaded);
    const local = store();

    await createChatHttpSyncTransport(local).send(entry([file]));

    expect(uploads.uploadChatAttachmentBlob).toHaveBeenCalledWith('c-1', expect.any(Blob), {
      fileName: 'a.pdf',
      mimeType: 'application/pdf',
    });
    expect(local.recordAttachmentUpload).toHaveBeenCalledWith(1, file.key, uploaded);
    expect(api.sendChatMessage).toHaveBeenCalledWith(
      'c-1',
      expect.objectContaining({ clientId, attachments: [uploaded] })
    );
  });

  it('does not send the same file twice on a replay', async () => {
    api.sendChatMessage.mockReset().mockResolvedValue({ success: true, message });
    uploads.uploadChatAttachmentBlob.mockReset();
    const local = store();

    await createChatHttpSyncTransport(local).send(entry([{ ...file, uploaded }]));

    expect(uploads.uploadChatAttachmentBlob).not.toHaveBeenCalled();
    expect(api.sendChatMessage).toHaveBeenCalledWith(
      'c-1',
      expect.objectContaining({ attachments: [uploaded] })
    );
  });

  it('gives up on a line whose bytes the device no longer holds', async () => {
    api.sendChatMessage.mockReset();
    uploads.uploadChatAttachmentBlob.mockReset();
    const local = store();
    (local.getMedia as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const failure = await createChatHttpSyncTransport(local)
      .send(entry([file]))
      .catch((error: unknown) => error);

    expect(classifySyncError(failure)).toBe('permanent');
    expect(api.sendChatMessage).not.toHaveBeenCalled();
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
