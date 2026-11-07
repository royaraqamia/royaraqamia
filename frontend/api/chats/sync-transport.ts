import { sendChatMessage } from '@/frontend/api/chats';
import type { ChatsLocalStore, ChatSendIntent } from '@/frontend/api/chats/local-store';
import { ApiError } from '@/frontend/transport/http';
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
 */
export function createChatHttpSyncTransport(store: ChatsLocalStore): SyncTransport {
  return {
    async send(entry: OutboxEntry) {
      const payload = entry.payload as ChatSendIntent;

      try {
        const result = await sendChatMessage(payload.conversationId, {
          body: payload.body,
          clientId: payload.clientId,
          ...(payload.replyToId ? { replyToId: payload.replyToId } : {}),
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
