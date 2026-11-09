import type { ChatMessage, ChatThread } from '@/shared/contracts/chat';

/** A watermark at or past the line means the member has seen it. */
function readPast(lastReadAt: string | null, createdAt: number): boolean {
  if (!lastReadAt) return false;
  const readAt = Date.parse(lastReadAt);
  return !Number.isNaN(readAt) && readAt >= createdAt;
}

/**
 * What a member's own bubble says about who has read it (#816).
 *
 * It is derived from the roster the thread already loaded, so a receipt costs no
 * query and no row: `chat_participants.last_read_at` is the only record
 * (ADR-0113 — unread is a watermark, not receipts).
 *
 * - a **direct** thread says «قُرئت» once the peer's watermark is at or past it;
 * - a **group** says «قرأها N» for the active members whose watermark is past it.
 *
 * The words are the thread's copy source rather than this module's (#819): the
 * app draws the same receipt, and a sentence typed here would be a sentence the
 * two clients could word differently (ADR-0098). So the answer is which receipt,
 * and `chat-thread-view.tsx` renders it.
 *
 * Nobody's own message reads as read to itself, a tombstone carries no receipt,
 * and a line no one has reached yet says nothing at all.
 */
export type ChatReadReceipt = { kind: 'peer' };

export function readReceiptOf(
  thread: ChatThread,
  message: ChatMessage,
  mine: boolean
): ChatReadReceipt | null {
  if (!mine || message.deletedAt) return null;

  const createdAt = Date.parse(message.createdAt);
  if (Number.isNaN(createdAt)) return null;

  const meId = thread.me?.userId ?? null;
  const readers = thread.participants.filter(
    (participant) =>
      participant.userId !== meId &&
      participant.status === 'active' &&
      readPast(participant.lastReadAt, createdAt)
  );

  if (readers.length === 0) return null;
  if (thread.kind === 'direct') return { kind: 'peer' };
  return null;
}

/**
 * Who is writing, as the thread words it. A direct thread already names the peer
 * in its header, so it needs only the act (#816).
 */
export function typingLabel(_thread: ChatThread, typers: string[]): string | null {
  if (typers.length === 0) return null;
  return 'يكتب الآن...';
}
