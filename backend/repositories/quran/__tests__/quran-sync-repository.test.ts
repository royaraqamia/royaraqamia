import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { createQuranSyncRepository } from '@/backend/repositories/quran';

interface Result {
  data: unknown;
  error: unknown;
}

interface Call {
  table: string;
  columns?: string;
}

/**
 * PostgREST-shaped fake.
 *
 * The repository reads before it writes — last-write-wins needs the stored
 * stamp — so the same table is queried twice in one operation and a static
 * per-table result cannot answer both. `answer` therefore sees the columns the
 * query selected: the pull asks for `*`, the LWW read asks for `id, updated_at`.
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

const POSITION_ROW = {
  id: 'p-1',
  user_id: 'u-1',
  surah: 2,
  ayah: 5,
  client_id: '11111111-1111-7111-8111-111111111111',
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-05T00:00:00.000Z',
  deleted_at: null,
  server_updated_at: '2026-10-05T00:00:01.000Z',
};

const BOOKMARK_ROW = {
  id: 'b-1',
  user_id: 'u-1',
  surah: 2,
  ayah: 255,
  client_id: '22222222-2222-7222-8222-222222222222',
  created_at: '2026-10-02T00:00:00.000Z',
  updated_at: '2026-10-03T00:00:00.000Z',
  deleted_at: null,
  server_updated_at: '2026-10-03T00:00:01.000Z',
};

describe('getSyncSnapshot', () => {
  it('hands back the owned records in the contract shape, tombstones included', async () => {
    const tombstoned = {
      ...BOOKMARK_ROW,
      id: 'b-2',
      ayah: 256,
      deleted_at: '2026-10-04T00:00:00.000Z',
      server_updated_at: '2026-10-04T00:00:02.000Z',
    };
    const { client } = makeClient(({ table, columns }) => {
      if (columns !== '*') return { data: null, error: null };
      if (table === 'quran_reading_positions') return { data: POSITION_ROW, error: null };
      if (table === 'quran_bookmarks') return { data: [BOOKMARK_ROW, tombstoned], error: null };
      return { data: null, error: null };
    });
    const repo = createQuranSyncRepository(client);

    const snapshot = await repo.getSyncSnapshot('u-1');

    expect(snapshot.position).toEqual({
      surah: 2,
      ayah: 5,
      updatedAt: '2026-10-05T00:00:00.000Z',
    });
    expect(snapshot.bookmarks).toEqual([
      {
        clientId: '22222222-2222-7222-8222-222222222222',
        surah: 2,
        ayah: 255,
        createdAt: '2026-10-02T00:00:00.000Z',
        updatedAt: '2026-10-03T00:00:00.000Z',
        deletedAt: null,
      },
      {
        clientId: '22222222-2222-7222-8222-222222222222',
        surah: 2,
        ayah: 256,
        createdAt: '2026-10-02T00:00:00.000Z',
        updatedAt: '2026-10-03T00:00:00.000Z',
        deletedAt: '2026-10-04T00:00:00.000Z',
      },
    ]);
    // The newest server stamp across both tables, so the next page cannot skip it.
    expect(snapshot.cursor).toBe('2026-10-05T00:00:01.000Z');
  });

  it('pages on server_updated_at for both tables, and keeps the cursor on an empty page', async () => {
    const { client, calls } = makeClient();
    const repo = createQuranSyncRepository(client);

    const snapshot = await repo.getSyncSnapshot('u-1', '2026-10-10T00:00:00.000Z');

    expect(calls).toContain(
      'quran_reading_positions:gt server_updated_at=2026-10-10T00:00:00.000Z'
    );
    expect(calls).toContain('quran_bookmarks:gt server_updated_at=2026-10-10T00:00:00.000Z');
    expect(snapshot).toEqual({
      position: null,
      bookmarks: [],
      cursor: '2026-10-10T00:00:00.000Z',
    });
  });

  it('reads a tombstoned position as no position rather than as a place to resume', async () => {
    const { client } = makeClient(({ table, columns }) =>
      table === 'quran_reading_positions' && columns === '*'
        ? { data: { ...POSITION_ROW, deleted_at: '2026-10-06T00:00:00.000Z' }, error: null }
        : { data: null, error: null }
    );
    const repo = createQuranSyncRepository(client);

    const snapshot = await repo.getSyncSnapshot('u-1');

    expect(snapshot.position).toBeNull();
  });

  it('keys a row written outside the API by its server id instead of dropping it', async () => {
    const { client } = makeClient(({ table, columns }) =>
      table === 'quran_bookmarks' && columns === '*'
        ? { data: [{ ...BOOKMARK_ROW, client_id: null }], error: null }
        : { data: null, error: null }
    );
    const repo = createQuranSyncRepository(client);

    const snapshot = await repo.getSyncSnapshot('u-1');

    expect(snapshot.bookmarks[0]?.clientId).toBe('b-1');
  });

  it('renders a Postgres instant the way the device writes it', async () => {
    const { client } = makeClient(({ table, columns }) =>
      table === 'quran_bookmarks' && columns === '*'
        ? {
            data: [
              {
                ...BOOKMARK_ROW,
                created_at: '2026-10-02T00:00:00+00:00',
                updated_at: '2026-10-03T00:00:00+00:00',
                deleted_at: '2026-10-04T00:00:00+00:00',
              },
            ],
            error: null,
          }
        : { data: null, error: null }
    );
    const repo = createQuranSyncRepository(client);

    const snapshot = await repo.getSyncSnapshot('u-1');

    // `+00:00` from the database and `Z` from the device are the same instant;
    // a string-compared merge must not see them as two.
    expect(snapshot.bookmarks[0]).toMatchObject({
      createdAt: '2026-10-02T00:00:00.000Z',
      updatedAt: '2026-10-03T00:00:00.000Z',
      deletedAt: '2026-10-04T00:00:00.000Z',
    });
  });
});

describe('saveReadingPosition', () => {
  it('drops a replay older than the stored place', async () => {
    const { client, calls } = makeClient(() => ({ data: POSITION_ROW, error: null }));
    const repo = createQuranSyncRepository(client);

    await repo.saveReadingPosition(
      'u-1',
      { surah: 3, ayah: 1 },
      { clientId: '33333333-3333-7333-8333-333333333333', updatedAt: '2026-10-04T00:00:00.000Z' }
    );

    expect(calls.some((call) => call.includes(':update'))).toBe(false);
    expect(calls.some((call) => call.includes(':insert'))).toBe(false);
  });

  it('moves the one row the reader has, stamped with the write time and last writer', async () => {
    const { client, calls } = makeClient(({ columns }) =>
      columns === 'id, updated_at'
        ? { data: POSITION_ROW, error: null }
        : { data: null, error: null }
    );
    const repo = createQuranSyncRepository(client);

    await repo.saveReadingPosition(
      'u-1',
      { surah: 3, ayah: 7 },
      { clientId: '33333333-3333-7333-8333-333333333333', updatedAt: '2026-10-06T00:00:00.000Z' }
    );

    const update = calls.find((call) => call.startsWith('quran_reading_positions:update'));
    expect(update).toBeDefined();
    expect(JSON.parse(update!.slice('quran_reading_positions:update '.length))).toEqual({
      surah: 3,
      ayah: 7,
      updated_at: '2026-10-06T00:00:00.000Z',
      deleted_at: null,
      client_id: '33333333-3333-7333-8333-333333333333',
    });
    // Keyed by the natural identity, not by the row id the reader never sees.
    expect(calls).toContain('quran_reading_positions:eq user_id=u-1');
    expect(calls).not.toContain('quran_reading_positions:eq id=p-1');
  });

  it('inserts the first place a reader records', async () => {
    const { client, calls } = makeClient();
    const repo = createQuranSyncRepository(client);

    await repo.saveReadingPosition(
      'u-1',
      { surah: 1, ayah: 1 },
      { clientId: '33333333-3333-7333-8333-333333333333', updatedAt: '2026-10-06T00:00:00.000Z' }
    );

    const insert = calls.find((call) => call.startsWith('quran_reading_positions:insert'));
    expect(JSON.parse(insert!.slice('quran_reading_positions:insert '.length))).toEqual({
      user_id: 'u-1',
      surah: 1,
      ayah: 1,
      client_id: '33333333-3333-7333-8333-333333333333',
      updated_at: '2026-10-06T00:00:00.000Z',
    });
  });

  it('leaves the recorded client id alone when a write carries none', async () => {
    const { client, calls } = makeClient(({ columns }) =>
      columns === 'id, updated_at'
        ? { data: POSITION_ROW, error: null }
        : { data: null, error: null }
    );
    const repo = createQuranSyncRepository(client);

    await repo.saveReadingPosition(
      'u-1',
      { surah: 3, ayah: 7 },
      { updatedAt: '2026-10-06T00:00:00.000Z' }
    );

    const update = calls.find((call) => call.startsWith('quran_reading_positions:update'));
    expect(JSON.parse(update!.slice('quran_reading_positions:update '.length))).not.toHaveProperty(
      'client_id'
    );
  });
});

describe('setBookmark', () => {
  const meta = {
    clientId: '44444444-4444-7444-8444-444444444444',
    updatedAt: '2026-10-07T00:00:00.000Z',
  };

  it('revives the row an unmark left behind instead of inserting a second one', async () => {
    const { client, calls } = makeClient(({ columns }) =>
      columns === 'id, updated_at'
        ? { data: { ...BOOKMARK_ROW, deleted_at: '2026-10-04T00:00:00.000Z' }, error: null }
        : { data: null, error: null }
    );
    const repo = createQuranSyncRepository(client);

    await repo.setBookmark('u-1', { surah: 2, ayah: 255, deletedAt: null }, meta);

    const update = calls.find((call) => call.startsWith('quran_bookmarks:update'));
    expect(JSON.parse(update!.slice('quran_bookmarks:update '.length))).toEqual({
      deleted_at: null,
      updated_at: '2026-10-07T00:00:00.000Z',
      client_id: '44444444-4444-7444-8444-444444444444',
    });
    expect(calls).toContain('quran_bookmarks:eq id=b-1');
    expect(calls.some((call) => call.includes(':insert'))).toBe(false);
  });

  it('tombstones the mark an unmark names, keeping the row for other devices', async () => {
    const { client, calls } = makeClient(({ columns }) =>
      columns === 'id, updated_at'
        ? { data: BOOKMARK_ROW, error: null }
        : { data: null, error: null }
    );
    const repo = createQuranSyncRepository(client);

    await repo.setBookmark(
      'u-1',
      { surah: 2, ayah: 255, deletedAt: '2026-10-07T00:00:00.000Z' },
      meta
    );

    const update = calls.find((call) => call.startsWith('quran_bookmarks:update'));
    expect(JSON.parse(update!.slice('quran_bookmarks:update '.length))).toMatchObject({
      deleted_at: '2026-10-07T00:00:00.000Z',
    });
    expect(calls.some((call) => call.includes(':insert'))).toBe(false);
  });

  it('drops a toggle older than the stored state', async () => {
    const { client, calls } = makeClient(() => ({ data: BOOKMARK_ROW, error: null }));
    const repo = createQuranSyncRepository(client);

    await repo.setBookmark(
      'u-1',
      { surah: 2, ayah: 255, deletedAt: '2026-10-02T00:00:00.000Z' },
      { ...meta, updatedAt: '2026-10-02T00:00:00.000Z' }
    );

    expect(calls.some((call) => call.includes(':update'))).toBe(false);
    expect(calls.some((call) => call.includes(':insert'))).toBe(false);
  });

  it('inserts the mark a device records first', async () => {
    const { client, calls } = makeClient();
    const repo = createQuranSyncRepository(client);

    await repo.setBookmark('u-1', { surah: 2, ayah: 255 }, meta);

    const insert = calls.find((call) => call.startsWith('quran_bookmarks:insert'));
    expect(JSON.parse(insert!.slice('quran_bookmarks:insert '.length))).toEqual({
      user_id: 'u-1',
      surah: 2,
      ayah: 255,
      client_id: '44444444-4444-7444-8444-444444444444',
      updated_at: '2026-10-07T00:00:00.000Z',
      deleted_at: null,
    });
  });
});
