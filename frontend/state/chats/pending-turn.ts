import type { ChatAttachment, ChatMessage } from '@/shared/contracts/chat';

/**
 * The line the composer draws while its turn runs (#1541).
 *
 * A turn's question used to exist only as text sitting in the field until the
 * answer finished: the thread read it from the server after the stream closed,
 * so the member watched their own words wait. The composer now paints the line
 * the moment it is sent, the server hands back the stored row as the turn's
 * first frame, and the bubble is the same one the thread would draw from its
 * own read. `stored` is what tells a question the server accepted from a turn
 * that failed before it was written — the first is the thread's, the second is
 * still the member's to retry.
 */
export interface PendingTurn {
  /** The words as they were typed, kept for a retry. */
  body: string;
  /** The row drawn now: the local one, then the stored one once the turn names it. */
  message: ChatMessage;
  /** True once the server answered with the row it wrote. */
  stored: boolean;
  /** `failed` only before the question reached the thread. */
  status: 'sending' | 'failed';
}

function clientId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The files as attachment rows, with local ids.
 *
 * The ids never reach the server — the upload returns the storage paths a turn
 * is sent with — so they exist only to key the previews and the list items of
 * the bubble that is drawn before those paths come back.
 */
export function pendingAttachments(id: string, files: File[]): ChatAttachment[] {
  return files.map((file, index) => ({
    id: `${id}-${index}`,
    fileName: file.name || `file-${index + 1}`,
    mimeType: file.type || 'application/octet-stream',
    byteSize: file.size,
  }));
}

/** The local row a send paints before the server has seen it. */
export function createPendingTurn(
  conversationId: string,
  body: string,
  files: File[]
): PendingTurn {
  const id = clientId();
  const attachments = pendingAttachments(id, files);

  return {
    body,
    stored: false,
    status: 'sending',
    message: {
      id: `pending-${id}`,
      conversationId,
      senderId: null,
      senderKind: 'user',
      body: body || null,
      replyToId: null,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      clientId: id,
      attachments,
      replyTo: null,
    },
  };
}

/** The turn wrote the question: the bubble now names the thread's own row. */
export function withStoredMessage(pending: PendingTurn, message: ChatMessage): PendingTurn {
  return { ...pending, message, stored: true };
}

/**
 * Whether the thread's read already holds this line.
 *
 * The id is the server's once the turn names it, so the composer's copy is
 * dropped only when the stored row is on screen — never a frame earlier, which
 * is what made the question blink between the two reads.
 */
export function pendingIsStored(pending: PendingTurn, messages: ChatMessage[]): boolean {
  if (!pending.stored) return false;
  return messages.some((message) => message.id === pending.message.id);
}
