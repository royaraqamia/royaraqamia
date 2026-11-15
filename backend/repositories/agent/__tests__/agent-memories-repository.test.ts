import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createSupabaseAgentMemoriesRepository } from '@/backend/repositories/agent/agent-memories-repository';

interface Result {
  data?: unknown;
  error?: unknown;
}

/**
 * A PostgREST-shaped fake: it records the chain a call builds and answers one
 * scripted result. The shape of the request is the contract here — a read that
 * forgets `deleted_at is null` is what would hand the page a forgotten fact.
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

  select(columns?: string) {
    return this.log(`select ${String(columns)}`);
  }
  insert(row: unknown) {
    return this.log(`insert ${JSON.stringify(row)}`);
  }
  update(row: unknown) {
    return this.log(`update ${JSON.stringify(row)}`);
  }
  delete() {
    return this.log('delete');
  }
  eq(column: string, value: unknown) {
    return this.log(`eq ${column}=${String(value)}`);
  }
  is(column: string, value: unknown) {
    return this.log(`is ${column}=${String(value)}`);
  }
  order(column: string, options?: { ascending?: boolean }) {
    return this.log(`order ${column} ${options?.ascending ? 'asc' : 'desc'}`);
  }
  single() {
    this.log('single');
    return Promise.resolve(this.next());
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

  return { client: { from } as unknown as SupabaseClient, calls };
}

const row = {
  id: 'memory-1',
  user_id: 'member-1',
  scope: 'account',
  product: null,
  thread_id: null,
  kind: 'preference',
  text: 'أحبّ القهوة السادة',
  source_turn_id: null,
  confidence: 1,
  created_at: '2026-11-15T09:00:00.000Z',
  updated_at: '2026-11-15T09:00:00.000Z',
  deleted_at: null,
};

describe('the fact repository', () => {
  it('reads one member’s live facts, newest first', async () => {
    const { client, calls } = makeClient({
      agent_memories: { data: [row], error: null },
    });
    const repository = createSupabaseAgentMemoriesRepository(client);

    const memories = await repository.list('member-1');

    expect(memories).toEqual([
      {
        id: 'memory-1',
        scope: 'account',
        product: null,
        threadId: null,
        kind: 'preference',
        text: 'أحبّ القهوة السادة',
        sourceTurnId: null,
        confidence: 1,
        createdAt: '2026-11-15T09:00:00.000Z',
        updatedAt: '2026-11-15T09:00:00.000Z',
      },
    ]);
    expect(calls).toEqual([
      'agent_memories:select *',
      'agent_memories:eq user_id=member-1',
      'agent_memories:is deleted_at=null',
      'agent_memories:order created_at desc',
    ]);
  });

  it('writes the row as the caller, with the key its scope names', async () => {
    const { client, calls } = makeClient({
      agent_memories: { data: row, error: null },
    });
    const repository = createSupabaseAgentMemoriesRepository(client);

    const memory = await repository.insert({
      userId: 'member-1',
      text: 'أحبّ القهوة السادة',
      scope: 'account',
      product: null,
      threadId: null,
      kind: 'preference',
      sourceTurnId: null,
      confidence: 1,
    });

    expect(memory.id).toBe('memory-1');
    expect(calls[0]).toContain('"user_id":"member-1"');
    expect(calls[0]).toContain('"scope":"account"');
    expect(calls[0]).toContain('"confidence":1');
  });

  it('answers the live row when the same fact is saved twice', async () => {
    const { client, calls } = makeClient({
      agent_memories: [
        { data: null, error: { code: '23505' } },
        { data: [{ ...row, text: '  أحبّ القهوة السادة  ' }], error: null },
      ],
    });
    const repository = createSupabaseAgentMemoriesRepository(client);

    const memory = await repository.insert({
      userId: 'member-1',
      text: 'أحبّ القهوة السادة',
      scope: 'account',
      product: null,
      threadId: null,
      kind: 'preference',
      sourceTurnId: null,
      confidence: 1,
    });

    expect(memory.id).toBe('memory-1');
    // The refusal was a duplicate, so the row it names is read back rather than
    // raised: a member saying the same thing twice saved one fact.
    expect(calls[1]).toContain('agent_memories:select *');
  });

  it('edits only a live row of the caller', async () => {
    const { client, calls } = makeClient({
      agent_memories: { data: { ...row, text: 'أحبّ القهوة بالحليب' }, error: null },
    });
    const repository = createSupabaseAgentMemoriesRepository(client);

    const updated = await repository.update('member-1', 'memory-1', {
      text: 'أحبّ القهوة بالحليب',
    });

    expect(updated?.text).toBe('أحبّ القهوة بالحليب');
    expect(calls.slice(1)).toEqual([
      'agent_memories:eq id=memory-1',
      'agent_memories:eq user_id=member-1',
      'agent_memories:is deleted_at=null',
      'agent_memories:select *',
      'agent_memories:maybeSingle',
    ]);
  });

  it('forgets by stamping the row, and says when there was nothing to stamp', async () => {
    const { client, calls } = makeClient({
      agent_memories: [
        { data: { id: 'memory-1' }, error: null },
        { data: null, error: null },
      ],
    });
    const repository = createSupabaseAgentMemoriesRepository(client);

    expect(await repository.forget('member-1', 'memory-1', '2026-11-15T10:00:00.000Z')).toBe(true);
    expect(await repository.forget('member-1', 'memory-2', '2026-11-15T10:00:00.000Z')).toBe(false);
    expect(calls[0]).toContain('"deleted_at":"2026-11-15T10:00:00.000Z"');
    expect(calls).toContain('agent_memories:is deleted_at=null');
  });
});
