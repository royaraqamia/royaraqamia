import { describe, expect, it, vi } from 'vitest';

import { logger } from '@/backend/shared/logger';
import { settledTurn } from '@/backend/shared/domain/memory-extraction';
import { createMemoryExtractionService } from '@/backend/services/agent/memory-extraction-service';
import type { AgentMemory } from '@/backend/shared/domain/agent-memory';

/**
 * Extraction after the answer (ADR-0182 decision 2, decision 5, #1511). The
 * service has one promise to keep: whatever it does, the member already has
 * their answer and the turn is already settled.
 */

const MEMORY: AgentMemory = {
  id: 'memory-1',
  scope: 'account',
  product: null,
  threadId: null,
  kind: 'preference',
  text: 'العضو يفضّل أن يبدأ التقرير بالملخص',
  sourceTurnId: 'turn-1',
  confidence: 0.9,
  createdAt: '2026-11-15T10:00:00.000Z',
  updatedAt: '2026-11-15T10:00:00.000Z',
};

const TURN = settledTurn({
  turnId: 'turn-1',
  userId: 'user-1',
  conversationId: 'conversation-1',
  question: 'أفضّل أن يبدأ التقرير بالملخص، تذكّر ذلك.',
  answer: 'حسناً، سأبدأ بالملخص في المرة القادمة.',
  product: 'spendtrack',
});

function makeService(
  overrides: {
    reply?: (messages: unknown, signal: AbortSignal) => Promise<string>;
    claim?: (turnId: string, at: string) => Promise<boolean>;
    remember?: (input: unknown) => Promise<AgentMemory>;
  } = {}
) {
  const reply = vi.fn(
    overrides.reply ??
      (async () =>
        JSON.stringify({
          facts: [
            {
              text: 'العضو يفضّل أن يبدأ التقرير بالملخص',
              kind: 'preference',
              scope: 'account',
              confidence: 0.9,
            },
          ],
        }))
  );
  const claim = vi.fn(overrides.claim ?? (async () => true));
  const remember = vi.fn(overrides.remember ?? (async () => MEMORY));

  const service = createMemoryExtractionService({
    memories: { remember },
    claim,
    client: { reply },
  });

  return { service, reply, claim, remember };
}

describe('memory extraction', () => {
  it('writes one fact through the one door, cited and below certainty', async () => {
    const { service, remember, claim } = makeService();

    await service.extract(TURN);

    expect(claim).toHaveBeenCalledWith('turn-1', expect.any(String));
    expect(remember).toHaveBeenCalledWith({
      userId: 'user-1',
      text: 'العضو يفضّل أن يبدأ التقرير بالملخص',
      kind: 'preference',
      scope: 'account',
      product: null,
      threadId: null,
      sourceTurnId: 'turn-1',
      confidence: 0.9,
    });
  });

  it('writes nothing when the member’s turn carries a credential', async () => {
    const { service, reply, claim, remember } = makeService();

    await service.extract(settledTurn({ ...TURN, question: 'كلمة المرور هي hunter2، احفظها.' }));

    expect(reply).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
    expect(remember).not.toHaveBeenCalled();
  });

  it('writes nothing when an answer quotes a card number back', async () => {
    const { service, reply } = makeService();

    await service.extract(settledTurn({ ...TURN, answer: 'الرقم 4111 1111 1111 1111 صحيح.' }));

    expect(reply).not.toHaveBeenCalled();
  });

  it('loses the turn to whoever claimed it first, without paying for a second call', async () => {
    const { service, reply, remember } = makeService({ claim: async () => false });

    await service.extract(TURN);

    expect(reply).not.toHaveBeenCalled();
    expect(remember).not.toHaveBeenCalled();
  });

  it('writes nothing for a turn with no member words', async () => {
    const { service, claim, reply } = makeService();

    await service.extract(settledTurn({ ...TURN, question: '' }));

    expect(claim).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
  });

  it('turns a provider outage into one warning and no rows', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const { service, remember } = makeService({
      reply: async () => {
        throw new Error('provider down');
      },
    });

    await service.extract(TURN);

    expect(remember).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Memory extraction failed', {
      turn: 'turn-1',
      error: expect.stringContaining('provider down'),
    });
    warn.mockRestore();
  });

  it('writes nothing below the floor', async () => {
    const { service, remember } = makeService({
      reply: async () =>
        JSON.stringify({
          facts: [
            {
              text: 'العضو يفضّل أن يبدأ التقرير بالملخص',
              kind: 'preference',
              scope: 'account',
              confidence: 0.5,
            },
          ],
        }),
    });

    await service.extract(TURN);

    expect(remember).not.toHaveBeenCalled();
  });

  it('writes nothing out of an answer that is not the schema', async () => {
    const { service, remember } = makeService({ reply: async () => 'لا شيء يستحق الحفظ.' });

    await service.extract(TURN);

    expect(remember).not.toHaveBeenCalled();
  });

  it('loses one fact, not the exchange, when the door refuses it', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const remember = vi
      .fn()
      .mockRejectedValueOnce(new Error('refused'))
      .mockResolvedValueOnce(MEMORY);

    const { service } = makeService({
      remember,
      reply: async () =>
        JSON.stringify({
          facts: [
            {
              text: 'العضو يفضّل أن يبدأ التقرير بالملخص',
              kind: 'preference',
              scope: 'account',
              confidence: 0.9,
            },
            {
              text: 'العضو يفضّل أن يبدأ التقرير بالتفاصيل',
              kind: 'preference',
              scope: 'account',
              confidence: 0.9,
            },
          ],
        }),
    });

    await service.extract(TURN);

    expect(remember).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith('Memory extraction could not save a fact', {
      turn: 'turn-1',
      error: expect.stringContaining('refused'),
    });
    warn.mockRestore();
  });

  it('keeps a product fact inside the product the page was on', async () => {
    const { service, remember } = makeService({
      reply: async () =>
        JSON.stringify({
          facts: [
            {
              text: 'العضو يفضّل أن يبدأ التقرير بالملخص',
              kind: 'preference',
              scope: 'product',
              confidence: 0.9,
            },
          ],
        }),
    });

    await service.extract(TURN);

    expect(remember).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'product', product: 'spendtrack', threadId: null })
    );
  });
});
