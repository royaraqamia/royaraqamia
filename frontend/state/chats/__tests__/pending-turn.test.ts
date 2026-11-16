import { describe, expect, it } from 'vitest';
import {
  createPendingTurn,
  pendingIsStored,
  withStoredMessage,
} from '@/frontend/state/chats/pending-turn';

describe('a pending question', () => {
  it('is the member’s own line from the press', () => {
    const pending = createPendingTurn('c-1', 'كيف أبدأ؟', [
      new File(['bytes'], 'shot.png', { type: 'image/png' }),
    ]);

    expect(pending.message.body).toBe('كيف أبدأ؟');
    expect(pending.message.senderKind).toBe('user');
    expect(pending.message.attachments.map((attachment) => attachment.fileName)).toEqual([
      'shot.png',
    ]);
    expect(pending.stored).toBe(false);
    expect(pending.status).toBe('sending');
  });

  it('keeps the words as they were typed, for a retry', () => {
    const pending = createPendingTurn('c-1', 'سؤال', []);

    expect(pending.body).toBe('سؤال');
  });

  it('is dropped only once the thread draws the stored row', () => {
    const pending = createPendingTurn('c-1', 'سؤال', []);
    expect(pendingIsStored(pending, [])).toBe(false);

    const stored = withStoredMessage(pending, { ...pending.message, id: 'message-1' });
    expect(pendingIsStored(stored, [])).toBe(false);
    expect(pendingIsStored(stored, [{ ...stored.message }])).toBe(true);
  });
});
