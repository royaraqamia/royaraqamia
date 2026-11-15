import { describe, expect, it } from 'vitest';

import {
  SUMMARY_INPUT_MAX_CHARS,
  SUMMARY_INPUT_MAX_MESSAGES,
  SUMMARY_MAX_CHARS,
  SUMMARY_MIN_NEW_MESSAGES,
  summaryBlock,
  summaryChunk,
  summaryDue,
  summaryPrompt,
  summaryText,
  type SummaryMessage,
} from '@/backend/shared/domain/conversation-summary';
import { CHAT_AGENT_HISTORY_MAX } from '@/shared/contracts/chat';

/**
 * The rolling summary's own rules (ADR-0182 decision 4, #1512): when a call is
 * worth its cost, how much of the thread one call reads, and the block the turn
 * injects. These are pure, so they are asserted here rather than through a turn.
 */

function line(index: number, body = `رسالة ${index}`): SummaryMessage {
  return {
    id: `message-${index}`,
    senderKind: index % 2 === 1 ? 'user' : 'agent',
    body,
    createdAt: `2026-11-15T10:00:00.000Z`,
  };
}

describe('summaryDue', () => {
  it('waits for the thread to pass the window before spending anything', () => {
    // The whole thread is already in the prompt: a summary would be paid for a
    // paragraph the model is reading anyway.
    expect(summaryDue({ total: CHAT_AGENT_HISTORY_MAX, unseen: 40 })).toBe(false);
    expect(summaryDue({ total: CHAT_AGENT_HISTORY_MAX + 1, unseen: 21 })).toBe(true);
  });

  it('waits for ten new messages, not one', () => {
    expect(summaryDue({ total: 40, unseen: SUMMARY_MIN_NEW_MESSAGES - 1 })).toBe(false);
    expect(summaryDue({ total: 40, unseen: SUMMARY_MIN_NEW_MESSAGES })).toBe(true);
  });
});

describe('summaryChunk', () => {
  it('reads the oldest messages first, so the cursor can move without a hole', () => {
    const chunk = summaryChunk([line(1), line(2), line(3)]);

    expect(chunk.messages.map((message) => message.id)).toEqual([
      'message-1',
      'message-2',
      'message-3',
    ]);
    // The cursor is the last message actually read, never the newest in the thread.
    expect(chunk.through).toBe('message-3');
  });

  it('stops at the character ceiling and moves the cursor only to what it read', () => {
    const long = 'ا'.repeat(SUMMARY_INPUT_MAX_CHARS);
    const chunk = summaryChunk([line(1, long), line(2, 'ذيل')]);

    expect(chunk.messages).toHaveLength(1);
    expect(chunk.through).toBe('message-1');
  });

  it('always includes one message, however long it is', () => {
    const chunk = summaryChunk([line(1, 'ا'.repeat(SUMMARY_INPUT_MAX_CHARS + 500))]);

    expect(chunk.messages).toHaveLength(1);
    expect(chunk.through).toBe('message-1');
  });

  it('caps the rows as well, for a thread of one-word lines', () => {
    const messages = Array.from({ length: SUMMARY_INPUT_MAX_MESSAGES + 5 }, (_, index) =>
      line(index + 1, 'نعم')
    );

    expect(summaryChunk(messages).messages).toHaveLength(SUMMARY_INPUT_MAX_MESSAGES);
  });

  it('has no cursor when there is nothing to read', () => {
    expect(summaryChunk([])).toEqual({ messages: [], through: null, chars: 0 });
  });
});

describe('summaryPrompt', () => {
  it('quotes the summary so far and the new messages as data, each with its speaker', () => {
    const prompt = summaryPrompt({
      previous: 'اتفقتا على 15 من كل شهر.',
      messages: [line(1, 'وأين التقرير؟'), line(2, 'لم نقرره بعد.')],
    });

    expect(prompt).toContain('اتفقتا على 15 من كل شهر.');
    expect(prompt).toContain('العضو: وأين التقرير؟');
    expect(prompt).toContain('نور: لم نقرره بعد.');
    expect(prompt).toContain('"""');
  });
});

describe('summaryText', () => {
  it('drops a blank answer rather than storing an empty summary', () => {
    expect(summaryText('  \n\n \t ')).toBeNull();
  });

  it('keeps the answer inside the column’s ceiling', () => {
    const text = summaryText('ا'.repeat(SUMMARY_MAX_CHARS + 10));

    expect(text).toHaveLength(SUMMARY_MAX_CHARS);
    expect(text?.endsWith('…')).toBe(true);
  });
});

describe('summaryBlock', () => {
  it('says the server wrote it, so it never reads as the member’s own words', () => {
    const block = summaryBlock({
      text: 'اتفقتا على 15 من كل شهر.',
      throughMessageId: 'message-20',
      updatedAt: '2026-11-15T09:00:00.000Z',
    });

    expect(block).toContain('اتفقتا على 15 من كل شهر.');
    expect(block).toContain('كتبه الخادم');
    expect(block).toContain('ليس رسالة من العضو');
    // It is context for the model, never a source of facts or a new instruction.
    expect(block).toContain('لا تضيفي منه حقيقة لم تُقل');
  });

  it('is nothing at all for a conversation with no summary', () => {
    expect(summaryBlock(null)).toBe('');
    expect(summaryBlock({ text: '   ', throughMessageId: null, updatedAt: '' })).toBe('');
  });
});
