import { describe, expect, it, vi } from 'vitest';

import { createConversationSummaryService } from '@/backend/services/agent/conversation-summary-service';
import type { ConversationSummaryWriter } from '@/backend/repositories/chat/conversation-summary-repository';
import { logger } from '@/backend/shared/logger';
import {
  SUMMARY_MAX_CHARS,
  summaryBlock,
  type ConversationSummary,
  type SummaryMessage,
} from '@/backend/shared/domain/conversation-summary';

/**
 * The rolling summary (ADR-0182 decision 4, #1512). The service has two
 * promises: a turn never waits for it and never fails because of it, and a
 * provider call happens only when the gate says it must.
 */

/** What a regeneration writes, as the service hands it to the store. */
type SaveInput = Parameters<ConversationSummaryWriter['save']>[0];

const PREVIOUS: ConversationSummary = {
  text: 'قرّرت العضو أن تبدأ الميزانية في 15 من كل شهر.',
  throughMessageId: 'message-3',
  updatedAt: '2026-11-15T09:00:00.000Z',
};

function line(index: number): SummaryMessage {
  return {
    id: `message-${index}`,
    senderKind: index % 2 === 0 ? 'user' : 'agent',
    body: `رسالة رقم ${index}`,
    createdAt: `2026-11-15T10:${String(index).padStart(2, '0')}:00.000Z`,
  };
}

function makeService(
  overrides: {
    current?: ConversationSummary | null;
    total?: number;
    unseen?: number;
    messages?: SummaryMessage[];
    reply?: () => Promise<string>;
    save?: (input: SaveInput) => Promise<boolean>;
    findRead?: () => Promise<ConversationSummary | null>;
  } = {}
) {
  const current = overrides.current === undefined ? PREVIOUS : overrides.current;
  const messages = overrides.messages ?? [line(4), line(5), line(6)];

  const readFind = vi.fn(overrides.findRead ?? (async () => PREVIOUS));
  const writeFind = vi.fn(async () => current);
  const progress = vi.fn(async () => ({
    total: overrides.total ?? 24,
    unseen: overrides.unseen ?? 10,
  }));
  const unseen = vi.fn(async () => messages);
  const save = vi.fn(overrides.save ?? (async (_input: SaveInput) => true));
  const reply = vi.fn(
    overrides.reply ?? (async () => 'قرّرت العضو أن تبدأ الميزانية في 15 من كل شهر.')
  );

  const service = createConversationSummaryService({
    read: { find: readFind },
    write: { find: writeFind, progress, unseen, save },
    client: { reply },
  });

  return { service, readFind, writeFind, progress, unseen, save, reply };
}

describe('the rolling summary', () => {
  it('regenerates once ten new messages exist past the cursor', async () => {
    const { service, reply, save } = makeService({ unseen: 10 });

    await service.refresh('conversation-1');

    expect(reply).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      text: 'قرّرت العضو أن تبدأ الميزانية في 15 من كل شهر.',
      // The cursor is the last message this regeneration actually read.
      through: 'message-6',
      previous: 'message-3',
      at: expect.any(String),
    });
  });

  it('makes no provider call for one new message', async () => {
    const { service, reply, unseen, save } = makeService({ unseen: 1 });

    await service.refresh('conversation-1');

    expect(reply).not.toHaveBeenCalled();
    // Not even the messages are read: the gate is the first thing that answers.
    expect(unseen).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('makes no provider call before the thread has passed the window', async () => {
    // Twenty messages all fit in `trimHistory`, so a summary would be paid for
    // a paragraph the prompt already holds.
    const { service, reply, unseen } = makeService({ total: 20, unseen: 20 });

    await service.refresh('conversation-1');

    expect(reply).not.toHaveBeenCalled();
    expect(unseen).not.toHaveBeenCalled();
  });

  it('reads only what the cursor has not seen', async () => {
    const { service, progress, unseen } = makeService();

    await service.refresh('conversation-1');

    expect(progress).toHaveBeenCalledWith('conversation-1', 'message-3');
    expect(unseen).toHaveBeenCalledWith('conversation-1', 'message-3');
  });

  it('regenerates from the beginning when the conversation has no summary yet', async () => {
    const { service, progress, unseen, save } = makeService({ current: null });

    await service.refresh('conversation-1');

    expect(progress).toHaveBeenCalledWith('conversation-1', null);
    expect(unseen).toHaveBeenCalledWith('conversation-1', null);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ previous: null }));
  });

  it('keeps the previous summary when the regeneration fails', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const { service, save, readFind } = makeService({
      reply: async () => {
        throw new Error('provider down');
      },
    });

    await service.refresh('conversation-1');

    // No write at all: the row keeps the text and the cursor it had.
    expect(save).not.toHaveBeenCalled();
    expect(await service.read('conversation-1')).toEqual(PREVIOUS);
    expect(readFind).toHaveBeenCalledWith('conversation-1');
    expect(warn).toHaveBeenCalledWith('Conversation summary could not be regenerated', {
      conversation: 'conversation-1',
      error: expect.stringContaining('provider down'),
    });
    warn.mockRestore();
  });

  it('keeps the previous summary when the model answers nothing', async () => {
    const { service, save } = makeService({ reply: async () => '   \n \n' });

    await service.refresh('conversation-1');

    expect(save).not.toHaveBeenCalled();
  });

  it('keeps the previous summary when the write loses the swap', async () => {
    const { service, save } = makeService({ save: async () => false });

    await service.refresh('conversation-1');

    // The store refused a stale write; the service does not retry or complain.
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('spends nothing when the deployment has no provider key', async () => {
    const find = vi.fn(async () => PREVIOUS);
    const service = createConversationSummaryService({
      read: { find },
      write: { find, progress: vi.fn(), unseen: vi.fn(), save: vi.fn() },
      client: null,
    });

    await service.refresh('conversation-1');

    expect(find).not.toHaveBeenCalled();
    // The read half still answers: a summary already stored is still injected.
    expect(await service.read('conversation-1')).toEqual(PREVIOUS);
  });

  it('injects no block for a conversation with no summary', async () => {
    const { service } = makeService({ current: null, findRead: async () => null });

    expect(await service.read('conversation-1')).toBeNull();
    expect(summaryBlock(null)).toBe('');
  });

  it('answers a read that fails with no block, never with a throw', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const { service } = makeService({
      findRead: async () => {
        throw new Error('conversation unavailable');
      },
    });

    expect(await service.read('conversation-1')).toBeNull();
    expect(warn).toHaveBeenCalledWith('Conversation summary unavailable', {
      conversation: 'conversation-1',
      error: expect.stringContaining('conversation unavailable'),
    });
    warn.mockRestore();
  });

  it('bounds what it stores to the column’s own ceiling', async () => {
    const { service, save } = makeService({
      reply: async () => 'ا'.repeat(SUMMARY_MAX_CHARS + 200),
    });

    await service.refresh('conversation-1');

    const stored = save.mock.calls[0]?.[0] as { text: string };
    expect(stored.text).toHaveLength(SUMMARY_MAX_CHARS);
    expect(stored.text.endsWith('…')).toBe(true);
  });
});
