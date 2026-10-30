import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { createNotesRepository } from '@/backend/repositories/notes';

interface Result {
  data: unknown;
  error: unknown;
}

interface Call {
  table: string;
  columns?: string;
}

/**
 * PostgREST-shaped fake, the same one the Quran sync repository's tests use.
 *
 * A delete now reads before it writes — last-write-wins needs the stored stamp
 * — so the same table is queried twice in one operation and a static per-table
 * result cannot answer both. `answer` therefore sees the columns the query
 * selected: a delete's guard asks for `id, updated_at`.
 */
class Builder {
  private readonly log: string[] = [];

  constructor(
    private readonly table: string,
    private readonly calls: string[],
    private readonly answer: (call: Call) => Result
  ) {}

  private record(op: string) {
    this.log.push(op);
    this.calls.push(`${this.table}:${op}`);
    return this;
  }

  select(columns = '') {
    return this.record(`select ${columns}`);
  }
  eq(column: string, value: unknown) {
    return this.record(`eq ${column}=${String(value)}`);
  }
  gt(column: string, value: unknown) {
    return this.record(`gt ${column}=${String(value)}`);
  }
  is(column: string, value: unknown) {
    return this.record(`is ${column}=${String(value)}`);
  }
  insert(row: unknown) {
    return this.record(`insert ${JSON.stringify(row)}`);
  }
  update(row: unknown) {
    return this.record(`update ${JSON.stringify(row)}`);
  }

  private resolve(): Result {
    const columns = this.log.find((entry) => entry.startsWith('select '))?.slice('select '.length);
    return this.answer({ table: this.table, columns });
  }

  maybeSingle() {
    this.record('maybeSingle');
    return Promise.resolve(this.resolve());
  }

  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.resolve()).then(onfulfilled, onrejected);
  }
}

function makeClient(answer: (call: Call) => Result = () => ({ data: null, error: null })) {
  const calls: string[] = [];
  const from = vi.fn((table: string) => new Builder(table, calls, answer) as unknown);
  return { client: { from } as unknown as SupabaseClient<Database>, calls };
}

const NOTE_ID = '11111111-1111-7111-8111-111111111111';

/** The stored row as the guard's own read returns it. */
function storedAt(updatedAt: string) {
  return { data: { id: NOTE_ID, updated_at: updatedAt }, error: null };
}

function updateCall(calls: string[]) {
  const call = calls.find((entry) => entry.startsWith('notes:update'));
  return call ? JSON.parse(call.slice('notes:update '.length)) : null;
}

describe('deleteNote', () => {
  it('drops a delete older than the stored note instead of tombstoning it', async () => {
    const { client, calls } = makeClient(() => storedAt('2026-10-05T00:00:00.000Z'));
    const repo = createNotesRepository(client);

    // Device A deleted offline at t1; device B edited the same note at t2 > t1.
    await repo.deleteNote('u-1', NOTE_ID, { updatedAt: '2026-10-04T00:00:00.000Z' });

    expect(calls.some((call) => call.startsWith('notes:update'))).toBe(false);
  });

  it('tombstones on a delete equal to the stored stamp', async () => {
    const { client, calls } = makeClient(() => storedAt('2026-10-05T00:00:00.000Z'));
    const repo = createNotesRepository(client);

    await repo.deleteNote('u-1', NOTE_ID, { updatedAt: '2026-10-05T00:00:00.000Z' });

    expect(updateCall(calls)).toEqual({
      deleted_at: '2026-10-05T00:00:00.000Z',
      updated_at: '2026-10-05T00:00:00.000Z',
    });
  });

  it('tombstones on a delete newer than the stored stamp, with the device time', async () => {
    const { client, calls } = makeClient(() => storedAt('2026-10-05T00:00:00.000Z'));
    const repo = createNotesRepository(client);

    await repo.deleteNote('u-1', NOTE_ID, { updatedAt: '2026-10-06T00:00:00.000Z' });

    expect(updateCall(calls)).toEqual({
      deleted_at: '2026-10-06T00:00:00.000Z',
      updated_at: '2026-10-06T00:00:00.000Z',
    });
  });

  it('stamps a delete that carries no time with the server clock', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T09:00:00.000Z'));
    try {
      const { client, calls } = makeClient(() => storedAt('2026-10-05T00:00:00.000Z'));
      const repo = createNotesRepository(client);

      await repo.deleteNote('u-1', NOTE_ID);

      expect(updateCall(calls)).toEqual({
        deleted_at: '2026-10-30T09:00:00.000Z',
        updated_at: '2026-10-30T09:00:00.000Z',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('is a no-op for a note that never reached the server', async () => {
    const { client, calls } = makeClient(() => ({ data: null, error: null }));
    const repo = createNotesRepository(client);

    await expect(
      repo.deleteNote('u-1', NOTE_ID, { updatedAt: '2026-10-06T00:00:00.000Z' })
    ).resolves.toBeUndefined();

    expect(calls.some((call) => call.startsWith('notes:update'))).toBe(false);
    expect(calls.some((call) => call.startsWith('notes:insert'))).toBe(false);
  });

  it('reads and writes the row scoped to its owner', async () => {
    const { client, calls } = makeClient(() => storedAt('2026-10-05T00:00:00.000Z'));
    const repo = createNotesRepository(client);

    await repo.deleteNote('u-1', NOTE_ID, { updatedAt: '2026-10-06T00:00:00.000Z' });

    expect(calls).toContain('notes:select id, updated_at');
    expect(calls).toContain('notes:eq user_id=u-1');
    expect(calls).toContain(`notes:eq id=${NOTE_ID}`);
  });
});
