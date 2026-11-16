import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createSupabaseSkillTelemetryRepository } from '@/backend/repositories/chat/skill-telemetry-repository';

interface Result {
  data?: unknown;
  error?: unknown;
}

/**
 * A PostgREST-shaped fake. The shape of the request is half of what this test
 * is about: a write that appended instead of replacing would double a resumed
 * turn's count, and a read that forgot its order would show the operator the
 * roster in an order that means nothing.
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
  delete() {
    return this.log('delete');
  }
  insert(values: unknown) {
    return this.log(`insert ${JSON.stringify(values)}`);
  }
  eq(column: string, value: unknown) {
    return this.log(`eq ${column}=${String(value)}`);
  }
  order(column: string, options?: { ascending?: boolean }) {
    return this.log(`order ${column} ${options?.ascending === false ? 'desc' : 'asc'}`);
  }
  limit(count: number) {
    return this.log(`limit ${count}`);
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

const OUTCOME_ROW = {
  skill_id: 'legal-document-review',
  loaded_turns: 4,
  declined_turns: 1,
  answered_turns: 3,
  retried_turns: 1,
  failed_turns: 1,
};

describe('the skill telemetry repository', () => {
  it('replaces the rows of a resumed turn rather than appending (#1449)', async () => {
    const { client, calls } = makeClient();
    const repository = createSupabaseSkillTelemetryRepository(client);

    await repository.record('turn-1', [
      { skillId: 'legal-document-review', loaded: true },
      { skillId: 'design-brand-guardian', loaded: false },
    ]);

    expect(calls).toEqual([
      'agent_turn_skills:delete',
      'agent_turn_skills:eq turn_id=turn-1',
      'agent_turn_skills:insert [{"turn_id":"turn-1","skill_id":"legal-document-review","loaded":true},{"turn_id":"turn-1","skill_id":"design-brand-guardian","loaded":false}]',
    ]);
  });

  it('writes nothing for a turn that was offered nothing', async () => {
    const { client, calls } = makeClient();

    await createSupabaseSkillTelemetryRepository(client).record('turn-1', []);

    expect(calls).toEqual([]);
  });

  it('reads the aggregate view, most loaded first, bounded by the caller', async () => {
    const { client, calls } = makeClient({
      agent_skill_outcomes: { data: [OUTCOME_ROW] },
    });

    const rows = await createSupabaseSkillTelemetryRepository(client).outcomes(200);

    expect(calls).toEqual([
      'agent_skill_outcomes:select *',
      'agent_skill_outcomes:order loaded_turns desc',
      'agent_skill_outcomes:order skill_id asc',
      'agent_skill_outcomes:limit 200',
    ]);
    expect(rows).toEqual([
      {
        skillId: 'legal-document-review',
        loadedTurns: 4,
        declinedTurns: 1,
        answeredTurns: 3,
        retriedTurns: 1,
        failedTurns: 1,
      },
    ]);
  });

  it('reads an empty or null aggregate as zero rather than undefined', async () => {
    const { client } = makeClient({
      agent_skill_outcomes: {
        data: [{ ...OUTCOME_ROW, loaded_turns: null, answered_turns: null }],
      },
    });

    const [row] = await createSupabaseSkillTelemetryRepository(client).outcomes(200);

    expect(row?.loadedTurns).toBe(0);
    expect(row?.answeredTurns).toBe(0);
  });
});
