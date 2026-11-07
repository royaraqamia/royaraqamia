import { sendChatMessage } from '@/frontend/api/chats';
import type { ChatsLocalStore, ChatSendIntent } from '@/frontend/api/chats/local-store';
import { uploadChatAttachmentBlob } from '@/frontend/transport/supabase/chat-attachments';
import { ApiError } from '@/frontend/transport/http';
import type { ChatAttachmentInput } from '@/shared/contracts/chat';
import {
  PermanentSyncError,
  type SyncTransport,
} from '@/frontend/shared/local-store/sync-transport';
import type { OutboxEntry } from '@/frontend/shared/local-store/outbox';

/**
 * A queued line's replay (#1033).
 *
 * The outbox entry is the write the member made; this sends it, and on success
 * swaps the server's row in for the queued copy the screen has been showing.
 * `sendChatMessage` throws the server's own sentence for a refusal, and the
 * shared classifier turns that into "retry with backoff" or "give up and say
 * so" — with one exception named here: this endpoint answers 409 only when the
 * thread no longer takes writes (it is closed, or the group is full), which is a
 * refusal rather than a clash to retry, and the shared list retries 409s.
 *
 * Files go up before the message, and each accepted object is written back onto
 * the intent: a replay after a partial upload sends those bytes once, not twice.
 * A line whose bytes the device no longer holds cannot be delivered at all, so
 * that is a permanent refusal rather than a retry that could never succeed.
 */
export function createChatHttpSyncTransport(store: ChatsLocalStore): SyncTransport {
  return {
    async send(entry: OutboxEntry) {
      const payload = entry.payload as ChatSendIntent;

      try {
        const attachments: ChatAttachmentInput[] = [];
        for (const file of payload.attachments ?? []) {
          if (file.uploaded) {
            attachments.push(file.uploaded);
            continue;
          }

          const blob = await store.getMedia(file.key);
          if (!blob) throw new PermanentSyncError('تعذّر رفع الملف');

          const uploaded = await uploadChatAttachmentBlob(payload.conversationId, blob, {
            fileName: file.fileName,
            mimeType: file.mimeType,
          });
          attachments.push(uploaded);
          await store.recordAttachmentUpload(entry.seq, file.key, uploaded);
        }

        const result = await sendChatMessage(payload.conversationId, {
          ...(payload.body ? { body: payload.body } : {}),
          clientId: payload.clientId,
          ...(payload.replyToId ? { replyToId: payload.replyToId } : {}),
          ...(attachments.length > 0 ? { attachments } : {}),
        });

        if (!result.success || !result.message) {
          throw new PermanentSyncError(result.error ?? 'تعذّر إرسال الرسالة');
        }

        await store.applyServerMessage(result.message);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          throw new PermanentSyncError(error.message);
        }
        throw error;
      }
    },
  };
}
