import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createSupabaseMemoryEmbeddingsRepository,
  toVectorLiteral,
} from '@/backend/repositories/agent/memory-embeddings-repository';

interface Result {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

/**
 * A PostgREST-shaped fake: it records the chain each call builds and answers one
 * scripted result, because the shape of the request is what this test is about —
 * a vector that PostgREST receives as an array would be a 400 at runtime.
 */
class Builder {
  constructor(
    private readonly table: string,
    private readonly calls: string[],
    private readonly next: () => Result
  ) {}

  private log(op: string): this {
    this.calls.push(`${this.table}:${op}`);
    return this;
  }

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    return this.log(`select${options?.head ? ' head' : ''}`);
  }
  limit(count: number) {
    return this.log(`limit ${count}`);
  }
  eq(column: string, value: unknown) {
    return this.log(`eq ${column}=${String(value)}`);
  }
  upsert(rows: unknown, options?: { onConflict?: string }) {
    return this.log(`upsert ${JSON.stringify(rows)} onConflict=${String(options?.onConflict)}`);
  }
  delete() {
    return this.log('delete');
  }
  maybeSingle() {
    this.log('maybeSingle');
    return Promise.resolve(this.next());
  }
  then(resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) {
    return Promise.resolve(this.next()).then(resolve, reject);
  }
}

function makeClient(results: Record<string, Result | Result[]> = {}) {
  const calls: string[] = [];
  const cursors: Record<string, number> = {};

  const from = (table: string) => {
    const entry = results[table];
    const next = (): Result => {
      if (Array.isArray(entry)) {
        const index = Math.min(cursors[table] ?? 0, entry.length - 1);
        cursors[table] = (cursors[table] ?? 0) + 1;
        return entry[index] ?? {};
      }
      return entry ?? {};
    };
    return new Builder(table, calls, next);
  };

  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const rpc = (name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args });
    return Promise.resolve(results[`rpc:${name}`] ?? { data: [], error: null });
  };

  return { client: { from, rpc } as unknown as SupabaseClient, calls, rpcCalls };
}

const pendingRow = {
  source_kind: 'fact',
  source_id: 'memory-1',
  user_id: 'member-1',
  body: 'أحب القهوة',
  source_updated_at: '2026-11-15T10:00:00.000Z',
};

describe('the vector literal', () => {
  it('is the string pgvector reads, because JSON has no vector', () => {
    expect(toVectorLiteral([0.5, -0.25, 1])).toBe('[0.5,-0.25,1]');
  });
});

describe('the embeddings repository', () => {
  it('reads the work list from the view, and skips a row the view cannot describe', async () => {
    const { client, calls } = makeClient({
      agent_embedding_pending: { data: [pendingRow, { ...pendingRow, body: null }], error: null },
    });
    const repository = createSupabaseMemoryEmbeddingsRepository(client);

    const pending = await repository.pending(32);

    expect(pending).toEqual([
      {
        kind: 'fact',
        id: 'memory-1',
        userId: 'member-1',
        text: 'أحب القهوة',
        sourceUpdatedAt: '2026-11-15T10:00:00.000Z',
      },
    ]);
    expect(calls).toEqual(['agent_embedding_pending:select', 'agent_embedding_pending:limit 32']);
  });

  it('asks the view a second time for one fact, so an already-current fact is not work', async () => {
    const { client, calls } = makeClient({
      agent_embedding_pending: [
        { data: pendingRow, error: null },
        { data: null, error: null },
      ],
    });
    const repository = createSupabaseMemoryEmbeddingsRepository(client);

    expect(await repository.pendingFor('memory-1')).not.toBeNull();
    expect(await repository.pendingFor('memory-1')).toBeNull();
    expect(calls[1]).toBe('agent_embedding_pending:eq source_id=memory-1');
  });

  it('writes the vector as a literal and upserts on the fact, never inserting a second row', async () => {
    const { client, calls } = makeClient({ agent_memory_embeddings: { error: null } });
    const repository = createSupabaseMemoryEmbeddingsRepository(client);

    const written = await repository.write([
      {
        kind: 'fact',
        id: 'memory-1',
        userId: 'member-1',
        model: 'text-embedding-3-small',
        sourceUpdatedAt: '2026-11-15T10:00:00.000Z',
        embedding: [0.5, 0.25],
      },
    ]);

    expect(written).toBe(1);
    expect(calls[0]).toContain('upsert [');
    expect(calls[0]).toContain('"embedding":"[0.5,0.25]"');
    expect(calls[0]).toContain('"memory_id":"memory-1"');
    expect(calls[0]).toContain('onConflict=memory_id');
  });

  it('writes nothing for an empty batch, so a run cannot be one empty request', async () => {
    const { client, calls } = makeClient();
    const repository = createSupabaseMemoryEmbeddingsRepository(client);

    expect(await repository.write([])).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('asks the function for the nearest facts with the caller’s vector and scope', async () => {
    const { client, rpcCalls } = makeClient({
      'rpc:agent_memory_nearest': {
        data: [
          { memory_id: 'memory-1', text: 'أحب القهوة', similarity: 0.87, updated_at: '2026-11-01' },
        ],
        error: null,
      },
    });
    const repository = createSupabaseMemoryEmbeddingsRepository(client);

    const recalled = await repository.nearest('member-1', [0.5, 0.25], 24, {
      threadId: 'conversation-1',
      product: 'spendtrack',
    });

    expect(rpcCalls).toEqual([
      {
        name: 'agent_memory_nearest',
        args: {
          p_user_id: 'member-1',
          p_query: '[0.5,0.25]',
          p_limit: 24,
          p_thread_id: 'conversation-1',
          p_product: 'spendtrack',
        },
      },
    ]);
    expect(recalled).toEqual([
      { memoryId: 'memory-1', text: 'أحب القهوة', similarity: 0.87, updatedAt: '2026-11-01' },
    ]);
  });

  it('deletes the vector a forgotten fact left behind, by the fact it describes', async () => {
    const { client, calls } = makeClient({
      agent_memory_embeddings: [
        { data: { id: 'vector-1' }, error: null },
        { data: null, error: null },
      ],
    });
    const repository = createSupabaseMemoryEmbeddingsRepository(client);

    expect(await repository.remove('memory-1')).toBe(true);
    expect(await repository.remove('memory-2')).toBe(false);
    expect(calls.slice(0, 2)).toEqual([
      'agent_memory_embeddings:delete',
      'agent_memory_embeddings:eq memory_id=memory-1',
    ]);
  });

  it('counts the rows it holds and the rows still queued', async () => {
    const { client } = makeClient({
      agent_memory_embeddings: { count: 7, error: null },
      agent_embedding_pending: { count: 3, error: null },
    });
    const repository = createSupabaseMemoryEmbeddingsRepository(client);

    expect(await repository.counts()).toEqual({ stored: 7, pending: 3 });
  });
});
