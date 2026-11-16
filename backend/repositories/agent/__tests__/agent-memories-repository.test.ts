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
  upsert(row: unknown, options?: { onConflict?: string }) {
    return this.log(`upsert ${JSON.stringify(row)} on ${String(options?.onConflict)}`);
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

function makeClient(
  results: Record<string, Result | Result[]> = {},
  rpcResults: Record<string, Result | Result[]> = {}
) {
  const calls: string[] = [];
  const cursors: Record<string, number> = {};

  const scripted = (key: string, entry: Result | Result[] | undefined): Result => {
    if (Array.isArray(entry)) {
      const index = Math.min(cursors[key] ?? 0, entry.length - 1);
      cursors[key] = (cursors[key] ?? 0) + 1;
      return entry[index] ?? {};
    }
    return entry ?? {};
  };

  const from = (table: string) => new Builder(table, calls, () => scripted(table, results[table]));

  // The two forgets are functions, not table writes: the vector and the row are
  // one transaction inside the database (#1428), so the fake answers an `rpc`
  // and records the argument it was called with.
  const rpc = (name: string, args: Record<string, unknown>) => {
    calls.push(`rpc ${name} ${JSON.stringify(args)}`);
    return Promise.resolve(scripted(`rpc:${name}`, rpcResults[name]));
  };

  return { client: { from, rpc } as unknown as SupabaseClient, calls };
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

  it('forgets through the one function, and says when there was nothing live', async () => {
    const { client, calls } = makeClient(
      {},
      {
        agent_memory_forget: [
          { data: true, error: null },
          { data: false, error: null },
        ],
      }
    );
    const repository = createSupabaseAgentMemoriesRepository(client);

    expect(await repository.forget('memory-1')).toBe(true);
    expect(await repository.forget('memory-2')).toBe(false);
    // The member is not an argument: the function reads `auth.uid()` from the
    // caller's own session, so an id cannot be paired with somebody else.
    expect(calls).toEqual([
      'rpc agent_memory_forget {"p_memory_id":"memory-1"}',
      'rpc agent_memory_forget {"p_memory_id":"memory-2"}',
    ]);
  });

  it('forgets a conversation as one function too, and answers how many went', async () => {
    const { client, calls } = makeClient(
      {},
      { agent_memory_forget_thread: { data: 3, error: null } }
    );
    const repository = createSupabaseAgentMemoriesRepository(client);

    expect(await repository.forgetThread('thread-1')).toBe(3);
    expect(calls).toEqual(['rpc agent_memory_forget_thread {"p_thread_id":"thread-1"}']);
  });

  it('reads the switches, and answers every scope on when there is no row', async () => {
    const { client } = makeClient({ agent_memory_settings: { data: null, error: null } });
    const repository = createSupabaseAgentMemoriesRepository(client);

    expect(await repository.settings('member-1')).toEqual({
      account: true,
      product: true,
      thread: true,
    });
  });

  it('writes only the switch it was given, and answers all three', async () => {
    const { client, calls } = makeClient({
      agent_memory_settings: [
        { data: null, error: null },
        {
          data: {
            user_id: 'member-1',
            account_enabled: true,
            product_enabled: true,
            thread_enabled: false,
          },
          error: null,
        },
      ],
    });
    const repository = createSupabaseAgentMemoriesRepository(client);

    expect(await repository.saveSettings('member-1', { thread: false })).toEqual({
      account: true,
      product: true,
      thread: false,
    });
    expect(calls).toContain('agent_memory_settings:eq user_id=member-1');
    expect(calls.some((call) => call.includes('"thread_enabled":false'))).toBe(true);
  });
});
