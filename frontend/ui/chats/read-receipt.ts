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
 * Nobody's own message reads as read to itself, a tombstone carries no receipt,
 * and a line no one has reached yet says nothing at all.
 */
export function readReceiptOf(
  thread: ChatThread,
  message: ChatMessage,
  mine: boolean
): string | null {
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
  if (thread.kind === 'group') return `قرأها ${readers.length}`;
  if (thread.kind === 'direct') return 'قُرئت';
  return null;
}

/**
 * Who is writing, as the thread words it. A direct thread already names the peer
 * in its header, so it needs only the act; a group has to say who (#816).
 */
export function typingLabel(thread: ChatThread, typers: string[]): string | null {
  if (typers.length === 0) return null;
  if (thread.kind !== 'group') return 'يكتب الآن...';

  const nameOf = (userId: string) => {
    const peer = thread.participants.find((participant) => participant.userId === userId)?.peer;
    return peer?.name ?? peer?.username ?? null;
  };

  const first = nameOf(typers[0] ?? '');
  if (!first) return 'يكتب أحد الأعضاء...';
  return typers.length === 1 ? `${first} يكتب...` : `${first} وآخرون يكتبون...`;
}
