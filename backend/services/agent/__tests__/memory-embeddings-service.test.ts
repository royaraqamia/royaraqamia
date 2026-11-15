import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AiEmbeddingsClient } from '@/backend/clients/ai-embeddings';
import type { MemoryEmbeddingsRepository } from '@/backend/repositories/agent/memory-embeddings-repository';
import { createMemoryEmbeddingsService } from '@/backend/services/agent/memory-embeddings-service';
import {
  type EmbeddingSource,
  type EmbeddingWrite,
  type RecalledMemory,
} from '@/backend/shared/domain/agent-memory';

function source(id: string, text = `fact ${id}`): EmbeddingSource {
  return {
    kind: 'fact',
    id,
    userId: 'member-1',
    text,
    sourceUpdatedAt: '2026-11-15T10:00:00.000Z',
  };
}

/**
 * The pending view, as a fake: a written row leaves the queue, which is exactly
 * what makes a second run embed nothing.
 */
class FakeRepository implements MemoryEmbeddingsRepository {
  queued: EmbeddingSource[];
  written: EmbeddingWrite[] = [];
  removed: string[] = [];
  nearestCalls: { userId: string; limit: number }[] = [];
  failWrites = false;

  constructor(queued: EmbeddingSource[]) {
    this.queued = queued;
  }

  async pending(limit: number) {
    return this.queued.slice(0, limit);
  }

  async pendingFor(memoryId: string) {
    return this.queued.find((row) => row.id === memoryId) ?? null;
  }

  async write(rows: EmbeddingWrite[]) {
    if (this.failWrites) throw new Error('22000 vector dimension mismatch');
    this.written.push(...rows);
    this.queued = this.queued.filter((row) => !rows.some((write) => write.id === row.id));
    return rows.length;
  }

  async nearest(
    userId: string,
    _embedding: number[],
    limit: number,
    _scope: { threadId: string; product: string | null }
  ): Promise<RecalledMemory[]> {
    this.nearestCalls.push({ userId, limit });
    return [
      { memoryId: 'fact-1', text: 'أنت تحب القهوة', similarity: 0.9, updatedAt: '2026-11-01' },
    ];
  }

  async remove(memoryId: string) {
    this.removed.push(memoryId);
    return true;
  }

  async counts() {
    return { stored: this.written.length, pending: this.queued.length };
  }
}

function fakeClient(embed: AiEmbeddingsClient['embed'] = async (texts) => texts.map(() => [0.5])) {
  return {
    model: 'text-embedding-3-small',
    dimensions: 1536,
    embed: vi.fn(embed),
  } satisfies AiEmbeddingsClient;
}

describe('the memory embedding service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('backfills what is pending, and a second run embeds nothing', async () => {
    const repository = new FakeRepository([source('fact-1'), source('fact-2')]);
    const client = fakeClient();
    const service = createMemoryEmbeddingsService({ repository, client });

    const first = await service.backfill();
    expect(first).toEqual({ embedded: 2, batches: 1, stopped: 'done', pending: 0 });
    expect(repository.written.map((row) => row.id)).toEqual(['fact-1', 'fact-2']);
    expect(repository.written[0]).toMatchObject({
      model: 'text-embedding-3-small',
      userId: 'member-1',
    });

    const second = await service.backfill();
    expect(second).toEqual({ embedded: 0, batches: 0, stopped: 'done', pending: 0 });
    // The provider is called once for the write, never for the already-written run.
    expect(client.embed).toHaveBeenCalledTimes(1);
  });

  it('reports the queue and writes nothing when no provider is configured', async () => {
    const repository = new FakeRepository([source('fact-1')]);
    const service = createMemoryEmbeddingsService({ repository, client: null });

    expect(await service.backfill()).toEqual({
      embedded: 0,
      batches: 0,
      stopped: 'provider',
      pending: 1,
    });
    expect(repository.written).toHaveLength(0);
  });

  it('stops at the batch ceiling and says what is left, so the next run resumes', async () => {
    const queued = Array.from({ length: 5 }, (_, index) => source(`fact-${index}`));
    const repository = new FakeRepository(queued);
    const service = createMemoryEmbeddingsService({
      repository,
      client: fakeClient(),
    });

    const report = await service.backfill({ maxBatches: 2, batchSize: 2 });
    expect(report).toEqual({ embedded: 4, batches: 2, stopped: 'batch-limit', pending: 1 });

    const rest = await service.backfill({ maxBatches: 2, batchSize: 2 });
    expect(rest).toEqual({ embedded: 1, batches: 1, stopped: 'done', pending: 0 });
  });

  it('writes nothing from a batch the provider refused, and leaves it queued', async () => {
    const repository = new FakeRepository([source('fact-1'), source('fact-2')]);
    const service = createMemoryEmbeddingsService({
      repository,
      client: fakeClient(async () => null),
    });

    expect(await service.backfill()).toEqual({
      embedded: 0,
      batches: 0,
      stopped: 'provider',
      pending: 2,
    });
    expect(repository.written).toHaveLength(0);
  });

  it('embeds one fact on the write path, and does not re-embed a current one', async () => {
    const repository = new FakeRepository([source('fact-1')]);
    const client = fakeClient();
    const service = createMemoryEmbeddingsService({ repository, client });

    expect(await service.embedFact('fact-1')).toBe(true);
    expect(repository.written).toHaveLength(1);

    // Already embedded: the write path asks the pending view, not the provider.
    expect(await service.embedFact('fact-1')).toBe(false);
    expect(client.embed).toHaveBeenCalledTimes(1);
  });

  it('swallows a write failure: the fact is stored, only its vector is missing', async () => {
    const repository = new FakeRepository([source('fact-1')]);
    repository.failWrites = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = createMemoryEmbeddingsService({ repository, client: fakeClient() });

    expect(await service.embedFact('fact-1')).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('reads recall with no provider call at all', async () => {
    const repository = new FakeRepository([]);
    const client = fakeClient();
    const service = createMemoryEmbeddingsService({ repository, client });

    // The query vector is the caller's. A turn's read path pays one query, not
    // one embedding call (ADR-0185 decision 5).
    const recalled = await service.nearest(
      'member-1',
      [0.1, 0.2],
      { threadId: 'conversation-1', product: null },
      99
    );

    expect(recalled).toHaveLength(1);
    expect(client.embed).not.toHaveBeenCalled();
    // 99 is a candidate request, not an injection: the cap here is the depth the
    // floor and the six-item cap choose from.
    expect(repository.nearestCalls).toEqual([{ userId: 'member-1', limit: 24 }]);
  });

  it('deletes the vector of a forgotten fact, and swallows a failed delete', async () => {
    const repository = new FakeRepository([]);
    const service = createMemoryEmbeddingsService({ repository, client: fakeClient() });

    expect(await service.forget('fact-1')).toBe(true);
    expect(repository.removed).toEqual(['fact-1']);

    repository.remove = async () => {
      throw new Error('42501 permission denied');
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // The fact is already unrecallable; a stale vector is the operator's line.
    expect(await service.forget('fact-2')).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
