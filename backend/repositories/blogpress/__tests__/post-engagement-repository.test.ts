import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createPostEngagementRepository } from '@/backend/repositories/blogpress/post-engagement-repository';
import { RepositoryError } from '@/backend/shared/repository-error';

const POST_ID = '11111111-1111-4111-8111-111111111111';
const AUTHOR_ID = '22222222-2222-4222-8222-222222222222';

interface StoredComment {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

/** Comment `index`, newest last: the fake's rows ascend like the table's do. */
function comment(index: number): StoredComment {
  const stamp = String(index).padStart(2, '0');
  return {
    id: `00000000-0000-4000-8000-0000000000${stamp}`,
    post_id: POST_ID,
    author_id: AUTHOR_ID,
    body: `تعليق ${stamp}`,
    created_at: `2026-09-01T10:${stamp}:00.000Z`,
    edited_at: null,
    deleted_at: null,
  };
}

function thread(size: number): StoredComment[] {
  return Array.from({ length: size }, (_, index) => comment(index));
}

interface Read {
  head: boolean;
  count: string | null;
  limit: number | null;
  orFilter: string | null;
  matched: number;
}

interface Failures {
  page?: { message: string };
  head?: { message: string };
}

/**
 * PostgREST-shaped fake: filters narrow `matched`, `count` is the number of rows
 * the whole filter matches (what `Content-Range` reports), `limit` only slices
 * the answer, and `head: true` answers the count with no rows.
 */
function createClient(rows: StoredComment[], failures: Failures = {}) {
  const reads: Read[] = [];

  function builder() {
    let matched = [...rows];
    const orders: { column: keyof StoredComment; ascending: boolean }[] = [];
    let head = false;
    let wantsCount: string | null = null;
    let limit: number | null = null;
    let orFilter: string | null = null;
    let recorded = false;

    function answer() {
      const sorted = [...matched].sort((left, right) => {
        for (const { column, ascending } of orders) {
          const a = String(left[column]);
          const b = String(right[column]);
          if (a === b) continue;
          return (a < b ? -1 : 1) * (ascending ? 1 : -1);
        }
        return 0;
      });
      if (!recorded) {
        recorded = true;
        reads.push({ head, count: wantsCount, limit, orFilter, matched: matched.length });
      }
      return {
        data: head ? null : limit === null ? sorted : sorted.slice(0, limit),
        error: head ? (failures.head ?? null) : (failures.page ?? null),
        count: wantsCount ? matched.length : null,
      };
    }

    const api = {
      select: (_columns: string, options?: { count?: string; head?: boolean }) => {
        wantsCount = options?.count ?? null;
        head = options?.head === true;
        return api;
      },
      eq: (column: keyof StoredComment, value: unknown) => {
        matched = matched.filter((row) => row[column] === value);
        return api;
      },
      is: (column: keyof StoredComment, value: unknown) => {
        matched = matched.filter((row) => row[column] === value);
        return api;
      },
      or: (filter: string) => {
        orFilter = filter;
        const parsed = /^created_at\.lt\.(.+),and\(created_at\.eq\.(.+),id\.lt\.(.+)\)$/.exec(
          filter
        );
        if (!parsed) throw new Error(`unexpected cursor filter: ${filter}`);
        const [, before = '', sameStamp = '', beforeId = ''] = parsed;
        matched = matched.filter(
          (row) => row.created_at < before || (row.created_at === sameStamp && row.id < beforeId)
        );
        return api;
      },
      order: (column: keyof StoredComment, options?: { ascending?: boolean }) => {
        orders.push({ column, ascending: options?.ascending ?? true });
        return api;
      },
      limit: (size: number) => {
        limit = size;
        return Promise.resolve(answer());
      },
      then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(answer()).then(onFulfilled, onRejected),
    };

    return api;
  }

  return {
    supabase: { from: () => builder() } as unknown as SupabaseClient<Database>,
    reads,
  };
}

describe('listComments', () => {
  it('keeps the post live total on the second page, not the remaining rows', async () => {
    const { supabase } = createClient(thread(30));
    const repo = createPostEngagementRepository(supabase);

    const first = await repo.listComments(POST_ID, null, 20);
    expect(first.rows).toHaveLength(20);
    expect(first.rows[0]?.id).toBe(comment(29).id);
    expect(first.nextCursor).not.toBeNull();
    expect(first.total).toBe(30);

    const second = await repo.listComments(POST_ID, first.nextCursor, 20);
    expect(second.rows).toHaveLength(10);
    expect(second.rows[0]?.id).toBe(comment(9).id);
    expect(second.nextCursor).toBeNull();
    expect(second.total).toBe(30);
  });

  it('asks the live total only on a cursor page, and without the cursor', async () => {
    const { supabase, reads } = createClient(thread(30));
    const repo = createPostEngagementRepository(supabase);

    const first = await repo.listComments(POST_ID, null, 20);
    expect(reads).toEqual([
      { head: false, count: 'exact', limit: 21, orFilter: null, matched: 30 },
    ]);

    await repo.listComments(POST_ID, first.nextCursor, 20);

    const headReads = reads.filter((read) => read.head);
    expect(headReads).toHaveLength(1);
    expect(headReads[0]?.count).toBe('exact');
    expect(headReads[0]?.orFilter).toBeNull();
    expect(headReads[0]?.matched).toBe(30);

    const cursorReads = reads.filter((read) => !read.head);
    expect(cursorReads).toHaveLength(2);
    expect(cursorReads[1]?.orFilter).toContain('created_at.lt.');
    expect(cursorReads[1]?.matched).toBe(10);
  });

  it('answers a thread of exactly one page with no cursor and its total', async () => {
    const { supabase, reads } = createClient(thread(20));
    const repo = createPostEngagementRepository(supabase);

    const page = await repo.listComments(POST_ID, null, 20);

    expect(page.rows).toHaveLength(20);
    expect(page.nextCursor).toBeNull();
    expect(page.total).toBe(20);
    expect(reads.filter((read) => read.head)).toHaveLength(0);
  });

  it('counts a deleted comment out of the live total without shifting the page', async () => {
    const rows = thread(21);
    rows[0] = { ...rows[0]!, deleted_at: '2026-09-01T11:00:00.000Z' };
    const { supabase } = createClient(rows);
    const repo = createPostEngagementRepository(supabase);

    const first = await repo.listComments(POST_ID, null, 20);
    expect(first.total).toBe(20);
    expect(first.nextCursor).toBeNull();
  });

  it('surfaces a failed count read as a RepositoryError', async () => {
    const { supabase } = createClient(thread(30), { head: { message: 'db down' } });
    const repo = createPostEngagementRepository(supabase);

    const first = await repo.listComments(POST_ID, null, 20);

    await expect(repo.listComments(POST_ID, first.nextCursor, 20)).rejects.toBeInstanceOf(
      RepositoryError
    );
  });
});
