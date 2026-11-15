import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createSupabaseMemoryExtractionRepository } from '@/backend/repositories/agent/memory-extraction-repository';

interface Result {
  data?: unknown;
  error?: unknown;
}

/**
 * A PostgREST-shaped fake, like the fact repository's: the chain is the
 * contract. The claim is a conditional update, so the two filters that make it
 * conditional — the null `extracted_at` and the settled turn — are the test.
 */
class Builder {
  constructor(
    private readonly table: string,
    private readonly calls: string[],
    private readonly result: () => Result
  ) {}

  private log(op: string): this {
    this.calls.push(`${this.table}:${op}`);
    return this;
  }

  update(row: unknown) {
    return this.log(`update ${JSON.stringify(row)}`);
  }
  eq(column: string, value: unknown) {
    return this.log(`eq ${column}=${String(value)}`);
  }
  is(column: string, value: unknown) {
    return this.log(`is ${column}=${String(value)}`);
  }
  not(column: string, operator: string, value: unknown) {
    return this.log(`not ${column} ${operator} ${String(value)}`);
  }
  select(columns?: string) {
    return this.log(`select ${String(columns)}`);
  }
  then(resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) {
    return Promise.resolve(this.result()).then(resolve, reject);
  }
}

function makeClient(result: Result) {
  const calls: string[] = [];
  const client = {
    from: (table: string) => new Builder(table, calls, () => result),
  } as unknown as SupabaseClient;

  return { client, calls };
}

describe('the extraction repository', () => {
  it('claims a settled turn only when nobody claimed it before', async () => {
    const { client, calls } = makeClient({ data: [{ id: 'turn-1' }], error: null });
    const repository = createSupabaseMemoryExtractionRepository(client);

    const claimed = await repository.claim('turn-1', '2026-11-15T10:00:00.000Z');

    expect(claimed).toBe(true);
    expect(calls).toEqual([
      'agent_turns:update {"extracted_at":"2026-11-15T10:00:00.000Z"}',
      'agent_turns:eq id=turn-1',
      'agent_turns:is extracted_at=null',
      'agent_turns:not settled_at is null',
      'agent_turns:select id',
    ]);
  });

  it('answers false to the caller that lost the race', async () => {
    const { client } = makeClient({ data: [], error: null });
    const repository = createSupabaseMemoryExtractionRepository(client);

    await expect(repository.claim('turn-1', '2026-11-15T10:00:00.000Z')).resolves.toBe(false);
  });

  it('raises a database failure instead of pretending the turn is taken', async () => {
    const { client } = makeClient({ error: { message: 'connection reset' } });
    const repository = createSupabaseMemoryExtractionRepository(client);

    await expect(repository.claim('turn-1', '2026-11-15T10:00:00.000Z')).rejects.toThrow();
  });
});
