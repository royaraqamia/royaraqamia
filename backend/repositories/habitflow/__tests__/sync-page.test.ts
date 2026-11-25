import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseHabitRepository } from '@/backend/repositories/habitflow/supabase-repository';
import { HABIT_SYNC_PAGE_SIZE } from '@/shared/contracts/habitflow';

/**
 * One pull at 20,000 log rows must not be a 39 MB JSON body (#1788).
 * 500 rows serialise to about 183 KiB at the audit's measured 375 B/row;
 * this ceiling leaves room for the habit page as well.
 */
const BODY_CEILING_BYTES = 512 * 1024;

interface Row {
  id: string;
  server_updated_at: string;
  user_id: string;
  [key: string]: unknown;
}

/** A PostgREST-shaped fake that honours the cursor, the limit and the asc order. */
function pageClient(rowsByTable: Record<string, Row[]>) {
  const from = vi.fn((table: string) => {
    let since: string | null = null;
    let limit: number | null = null;
    const builder = {
      select: () => builder,
      order: () => builder,
      limit: (count: number) => {
        limit = count;
        return builder;
      },
      gt: (_column: string, value: string) => {
        since = value;
        return builder;
      },
      eq: (column: string, value: string) => {
        if (column === 'user_id' && value !== 'u-1') {
          throw new Error('the repository must scope the page to its owner');
        }
        return builder;
      },
      then<TResult1 = unknown, TResult2 = never>(
        onfulfilled?:
          ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
      ) {
        const page = (rowsByTable[table] ?? [])
          .filter((row) => !since || row.server_updated_at > since)
          .sort((a, b) =>
            a.server_updated_at < b.server_updated_at
              ? -1
              : a.server_updated_at > b.server_updated_at
                ? 1
                : a.id < b.id
                  ? -1
                  : a.id > b.id
                    ? 1
                    : 0
          )
          .slice(0, limit ?? undefined);
        return Promise.resolve({ data: page, error: null }).then(onfulfilled, onrejected);
      },
    };
    return builder;
  });
  return { client: { from } as unknown as SupabaseClient, from };
}

function logRow(index: number, deletedAt: string | null = null): Row {
  const stamp = new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString();
  return {
    id: `l-${index.toString().padStart(5, '0')}`,
    habit_id: 'h-1',
    date: '2026-01-01',
    completed: true,
    completed_at: stamp,
    log_kind: 'complete',
    note: null,
    user_id: 'u-1',
    client_id: `c-${index}`,
    updated_at: stamp,
    deleted_at: deletedAt,
    server_updated_at: stamp,
  };
}

describe('HabitFlow sync page', () => {
  it('answers 20,000 log rows in one bounded body and converges by cursor', async () => {
    const rows = Array.from({ length: 20_000 }, (_, index) => logRow(index));
    // A tombstone written after the first page must be part of the delta feed.
    const tombstone = logRow(20_000, new Date(Date.UTC(2026, 0, 1) + 20_000_000).toISOString());
    rows.push(tombstone);
    const { client } = pageClient({ habits: [], habit_logs: rows });
    const repo = new SupabaseHabitRepository(client, 'u-1');

    const first = await repo.getSyncData();

    expect(first.logs.length).toBeLessThanOrEqual(HABIT_SYNC_PAGE_SIZE);
    expect(Buffer.byteLength(JSON.stringify(first), 'utf8')).toBeLessThan(BODY_CEILING_BYTES);
    expect(first.cursor).toBe(rows[HABIT_SYNC_PAGE_SIZE - 1]?.server_updated_at);

    const seen = new Set<string>(first.logs.map((row) => row.id));
    let cursor = first.cursor;
    let pages = 1;
    let deletedStamp: string | null = null;
    while (cursor && cursor < tombstone.server_updated_at) {
      const next = await repo.getSyncData(cursor);
      expect(next.logs.length).toBeLessThanOrEqual(HABIT_SYNC_PAGE_SIZE);
      expect(Buffer.byteLength(JSON.stringify(next), 'utf8')).toBeLessThan(BODY_CEILING_BYTES);
      for (const row of next.logs) {
        expect(seen.has(row.id)).toBe(false);
        seen.add(row.id);
        if (row.id === tombstone.id) deletedStamp = row.deletedAt ?? null;
      }
      expect(next.cursor! > cursor).toBe(true);
      cursor = next.cursor;
      pages += 1;
    }

    expect(pages).toBe(41);
    expect(seen.size).toBe(rows.length);
    expect(deletedStamp).toBe(tombstone.deleted_at);
  });

  it('pages a mixed dataset without losing or duplicating a row', async () => {
    const habit = {
      id: 'h-1',
      name: 'قراءة',
      frequency: 'daily',
      created_at: '2026-01-01T00:00:00.000Z',
      archived: false,
      user_id: 'u-1',
      // Written after every log in the batch, so it arrives on the last page.
      server_updated_at: '2026-01-02T00:00:00.000Z',
    };
    const logs = Array.from({ length: 1_200 }, (_, index) => logRow(index));
    const { client } = pageClient({ habits: [habit], habit_logs: logs });
    const repo = new SupabaseHabitRepository(client, 'u-1');

    const delivered: string[] = [];
    let cursor: string | null = null;
    for (;;) {
      const page = await repo.getSyncData(cursor);
      delivered.push(
        ...page.habits.map((row) => `habit:${row.id}`),
        ...page.logs.map((row) => row.id)
      );
      if (!page.cursor || page.cursor === cursor) break;
      cursor = page.cursor;
    }

    expect(delivered).toHaveLength(1 + logs.length);
    expect(new Set(delivered).size).toBe(delivered.length);
    expect(delivered).toContain('habit:h-1');
  });
});
