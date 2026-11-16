import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AiEmbeddingsClient } from '@/backend/clients/ai-embeddings';
import { createAgentRecallService } from '@/backend/services/agent/agent-recall-service';
import {
  RECALL_CANDIDATES,
  RECALL_HALF_LIFE_DAYS,
  RECALL_MAX_ITEMS,
  RECALL_QUERY_TIMEOUT_MS,
  RECALL_SIMILARITY_FLOOR,
  type RecallScope,
  type RecalledMemory,
} from '@/backend/shared/domain/agent-memory';

const NOW = Date.parse('2026-11-15T12:00:00.000Z');

function fact(
  id: string,
  similarity: number,
  updatedAt = '2026-11-14T12:00:00.000Z'
): RecalledMemory {
  return { memoryId: id, text: `fact ${id}`, similarity, updatedAt };
}

function daysAgo(days: number): string {
  return new Date(NOW - days * 86_400_000).toISOString();
}

function fakeClient(embed: AiEmbeddingsClient['embed'] = async () => [[0.5, 0.25]]) {
  return {
    model: 'text-embedding-3-small',
    dimensions: 1536,
    embed: vi.fn(embed),
  } satisfies AiEmbeddingsClient;
}

const SCOPE: RecallScope = { threadId: 'conversation-1', product: 'spendtrack' };

describe('the recall service', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('embeds the member’s own message once, and asks for the thread’s scope', async () => {
    const client = fakeClient();
    const nearest = vi.fn(async () => [fact('a', 0.9)]);

    const service = createAgentRecallService({ nearest, client, now: () => NOW });
    const recalled = await service.recall({
      userId: 'member-1',
      question: '  ما ميزانيتي هذا الشهر؟  ',
      ...SCOPE,
    });

    expect(client.embed).toHaveBeenCalledTimes(1);
    expect(client.embed).toHaveBeenCalledWith(['ما ميزانيتي هذا الشهر؟'], expect.any(AbortSignal));
    expect(nearest).toHaveBeenCalledWith('member-1', [0.5, 0.25], SCOPE, RECALL_CANDIDATES);
    expect(recalled.map((item) => item.memoryId)).toEqual(['a']);
  });

  it('injects nothing when every candidate is below the floor', async () => {
    const client = fakeClient();
    const nearest = vi.fn(async () => [
      fact('near-but-unrelated', RECALL_SIMILARITY_FLOOR - 0.01),
      fact('further', 0.1),
    ]);

    const service = createAgentRecallService({ nearest, client, now: () => NOW });
    const recalled = await service.recall({ userId: 'member-1', question: 'مرحبا', ...SCOPE });

    // The message is unrelated to everything saved, so the turn carries no block.
    expect(recalled).toEqual([]);
  });

  it('reuses the turn’s own vector instead of embedding the message twice (#1448)', async () => {
    const client = fakeClient();
    const nearest = vi.fn(async () => [fact('a', 0.9)]);
    const service = createAgentRecallService({ nearest, client, now: () => NOW });

    const shared = new Array<number>(1536).fill(0.1);
    const recalled = await service.recall({
      userId: 'member-1',
      question: 'قهوتي',
      ...SCOPE,
      vector: shared,
    });

    expect(client.embed).not.toHaveBeenCalled();
    expect(nearest).toHaveBeenCalledWith('member-1', shared, SCOPE, RECALL_CANDIDATES);
    expect(recalled.map((item) => item.memoryId)).toEqual(['a']);
  });

  it('needs no client when the turn already paid for the vector', async () => {
    const nearest = vi.fn(async () => [fact('a', 0.9)]);
    const service = createAgentRecallService({ nearest, client: null, now: () => NOW });

    const recalled = await service.recall({
      userId: 'member-1',
      question: 'قهوتي',
      ...SCOPE,
      vector: new Array<number>(1536).fill(0.1),
    });

    expect(recalled.map((item) => item.memoryId)).toEqual(['a']);
  });

  it('ignores a shared vector the memory table cannot store', async () => {
    const client = fakeClient();
    const nearest = vi.fn(async () => [fact('a', 0.9)]);
    const service = createAgentRecallService({ nearest, client, now: () => NOW });

    // The specialist artifact is 1024 wide; this table is 1536. A vector from
    // the other generation is a turn without recall, never a mismatched write.
    const recalled = await service.recall({
      userId: 'member-1',
      question: 'قهوتي',
      ...SCOPE,
      vector: new Array<number>(1024).fill(0.1),
    });

    expect(client.embed).toHaveBeenCalledTimes(1);
    expect(recalled.map((item) => item.memoryId)).toEqual(['a']);
  });

  it('orders survivors by decayed similarity, not by similarity alone', async () => {
    const client = fakeClient();
    const nearest = vi.fn(async () => [
      fact('old-strong', 0.8, daysAgo(RECALL_HALF_LIFE_DAYS * 3)),
      fact('new-slightly-weaker', 0.75, daysAgo(1)),
      fact('fresh', 0.6, daysAgo(0)),
    ]);

    const service = createAgentRecallService({ nearest, client, now: () => NOW });
    const recalled = await service.recall({ userId: 'member-1', question: 'قهوتي', ...SCOPE });

    expect(recalled.map((item) => item.memoryId)).toEqual([
      'new-slightly-weaker',
      'fresh',
      'old-strong',
    ]);
  });

  it('never injects more than six, whatever the ranking returns', async () => {
    const client = fakeClient();
    const nearest = vi.fn(async () =>
      Array.from({ length: RECALL_CANDIDATES }, (_, index) => fact(`f${index}`, 0.9))
    );

    const service = createAgentRecallService({ nearest, client, now: () => NOW });
    const recalled = await service.recall({ userId: 'member-1', question: 'سؤالي', ...SCOPE });

    expect(recalled).toHaveLength(RECALL_MAX_ITEMS);
  });

  it('has no recall at all without an embedding client, and spends no query', async () => {
    const nearest = vi.fn(async () => [fact('a', 0.9)]);
    const service = createAgentRecallService({ nearest, client: null, now: () => NOW });

    const recalled = await service.recall({ userId: 'member-1', question: 'سؤالي', ...SCOPE });

    expect(recalled).toEqual([]);
    expect(nearest).not.toHaveBeenCalled();
  });

  it('answers an empty list when the provider refuses the vector', async () => {
    const nearest = vi.fn(async () => [fact('a', 0.9)]);
    const service = createAgentRecallService({
      nearest,
      client: fakeClient(async () => null),
      now: () => NOW,
    });

    expect(await service.recall({ userId: 'member-1', question: 'سؤالي', ...SCOPE })).toEqual([]);
    expect(nearest).not.toHaveBeenCalled();
  });

  it('swallows a failed search, so the turn answers without memory', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const nearest = vi.fn(async () => {
      throw new Error('57014 statement timeout');
    });

    const service = createAgentRecallService({ nearest, client: fakeClient(), now: () => NOW });
    const recalled = await service.recall({ userId: 'member-1', question: 'سؤالي', ...SCOPE });

    expect(recalled).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('gives a hanging provider its budget and no more', async () => {
    vi.useFakeTimers();
    const nearest = vi.fn(async () => [fact('a', 0.9)]);
    const client = fakeClient(
      (_texts, signal) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () => resolve(null), { once: true });
        })
    );

    const service = createAgentRecallService({ nearest, client, now: () => NOW });
    const pending = service.recall({ userId: 'member-1', question: 'سؤالي', ...SCOPE });

    await vi.advanceTimersByTimeAsync(RECALL_QUERY_TIMEOUT_MS);

    expect(await pending).toEqual([]);
    expect(nearest).not.toHaveBeenCalled();
  });

  it('makes no provider call for a message with no words in it', async () => {
    const client = fakeClient();
    const nearest = vi.fn(async () => [fact('a', 0.9)]);
    const service = createAgentRecallService({ nearest, client, now: () => NOW });

    expect(await service.recall({ userId: 'member-1', question: '   ', ...SCOPE })).toEqual([]);
    expect(client.embed).not.toHaveBeenCalled();
  });
});
