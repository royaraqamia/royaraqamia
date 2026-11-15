import { describe, expect, it, vi } from 'vitest';

import type {
  AgentMemoryRepository,
  AgentMemoryWrite,
} from '@/backend/repositories/agent/agent-memories-repository';
import {
  createAgentMemoryService,
  MemoryRefusalError,
} from '@/backend/services/agent/agent-memory-service';
import {
  MEMORY_REFUSED_SENTENCE,
  MEMORY_SCOPE_KEY,
  MEMORY_TOO_LONG,
  type AgentMemory,
} from '@/backend/shared/domain/agent-memory';

const saved: AgentMemory = {
  id: 'memory-1',
  scope: 'account',
  product: null,
  threadId: null,
  kind: 'fact',
  text: 'الموعد الشهري في الخامس عشر',
  sourceTurnId: null,
  confidence: 1,
  createdAt: '2026-11-15T09:00:00.000Z',
  updatedAt: '2026-11-15T09:00:00.000Z',
};

function makeRepository(overrides: Partial<AgentMemoryRepository> = {}): {
  repository: AgentMemoryRepository;
  inserted: AgentMemoryWrite[];
} {
  const inserted: AgentMemoryWrite[] = [];
  const repository: AgentMemoryRepository = {
    list: async () => [saved],
    find: async () => saved,
    insert: async (input) => {
      inserted.push(input);
      return { ...saved, text: input.text, kind: input.kind, confidence: input.confidence };
    },
    update: async (_userId, _id, patch) => ({ ...saved, ...patch }),
    forget: async () => true,
    ...overrides,
  };
  return { repository, inserted };
}

function makeService(repository: AgentMemoryRepository) {
  const embeddings = { embedFact: vi.fn(async () => true), forget: vi.fn(async () => true) };
  return { service: createAgentMemoryService({ repository, embeddings }), embeddings };
}

describe('the fact write path (#1509)', () => {
  it('trims the fact and defaults to a fact of the account, believed at 1.00', async () => {
    const { repository, inserted } = makeRepository();
    const { service, embeddings } = makeService(repository);

    await service.remember({ userId: 'member-1', text: '  الموعد الشهري في الخامس عشر  ' });

    expect(inserted).toEqual([
      {
        userId: 'member-1',
        text: 'الموعد الشهري في الخامس عشر',
        scope: 'account',
        product: null,
        threadId: null,
        kind: 'fact',
        sourceTurnId: null,
        confidence: 1,
      },
    ]);
    // The write is not finished until the fact can be found again.
    expect(embeddings.embedFact).toHaveBeenCalledWith('memory-1');
  });

  it('refuses a card number, and answers in the member’s language', async () => {
    const { repository, inserted } = makeRepository();
    const { service } = makeService(repository);

    await expect(
      service.remember({ userId: 'member-1', text: 'بطاقتي 4111 1111 1111 1111' })
    ).rejects.toThrow(MemoryRefusalError);
    await expect(
      service.remember({ userId: 'member-1', text: 'بطاقتي 4111 1111 1111 1111' })
    ).rejects.toThrow(MEMORY_REFUSED_SENTENCE);

    // The refusal is the writer's, and it happens before a row could exist.
    expect(inserted).toHaveLength(0);
  });

  it('refuses a password handed over, and keeps a fact that only mentions one', async () => {
    const { repository, inserted } = makeRepository();
    const { service } = makeService(repository);

    await expect(
      service.remember({ userId: 'member-1', text: 'password: hunter2' })
    ).rejects.toThrow(MEMORY_REFUSED_SENTENCE);

    // "I forgot my password" is something the member asked to remember; the
    // word alone is not a credential, and refusing it would be a memory that
    // forgets what people actually talk about.
    await service.remember({ userId: 'member-1', text: 'نسيت كلمة المرور وأحتاج تذكيراً' });
    expect(inserted).toHaveLength(1);
  });

  it('refuses a fact longer than the row may hold', async () => {
    const { repository } = makeRepository();
    const { service } = makeService(repository);

    await expect(service.remember({ userId: 'member-1', text: 'ا'.repeat(501) })).rejects.toThrow(
      MEMORY_TOO_LONG
    );
  });

  it('refuses a product or thread scope without the key it names', async () => {
    const { repository } = makeRepository();
    const { service } = makeService(repository);

    await expect(
      service.remember({ userId: 'member-1', text: 'أنا شهري', scope: 'product' })
    ).rejects.toThrow(MEMORY_SCOPE_KEY);
    await expect(
      service.remember({ userId: 'member-1', text: 'أنا شهري', scope: 'thread' })
    ).rejects.toThrow(MEMORY_SCOPE_KEY);
  });

  it('carries a lower confidence for extraction, and a kind it can name', async () => {
    const { repository, inserted } = makeRepository();
    const { service } = makeService(repository);

    await service.remember({
      userId: 'member-1',
      text: 'أفضّل التذكير صباحاً',
      kind: 'preference',
      confidence: 0.42,
    });

    expect(inserted[0]).toMatchObject({ kind: 'preference', confidence: 0.42 });
  });

  it('still answers the fact when the embedding could not be written', async () => {
    const { repository } = makeRepository();
    const embeddings = { embedFact: vi.fn(async () => false), forget: vi.fn(async () => true) };
    const service = createAgentMemoryService({ repository, embeddings });

    // A memory that cannot be embedded is still a memory (ADR-0182 decision 3).
    await expect(
      service.remember({ userId: 'member-1', text: 'أحبّ القهوة' })
    ).resolves.toMatchObject({ id: 'memory-1' });
  });

  it('re-embeds an edited fact, because its vector is now stale', async () => {
    const { repository } = makeRepository();
    const { service, embeddings } = makeService(repository);

    await service.edit('member-1', 'memory-1', { text: 'الموعد صار في العشرين' });

    expect(embeddings.embedFact).toHaveBeenCalledWith('memory-1');
  });

  it('deletes the vector of a forgotten fact, and does nothing for a row that was not there', async () => {
    const { repository } = makeRepository();
    const { service, embeddings } = makeService(repository);

    expect(await service.forget('member-1', 'memory-1')).toBe(true);
    expect(embeddings.forget).toHaveBeenCalledWith('memory-1');

    const missing = makeRepository({ forget: async () => false });
    const second = makeService(missing.repository);
    expect(await second.service.forget('member-1', 'memory-2')).toBe(false);
    expect(second.embeddings.forget).not.toHaveBeenCalled();
  });
});
