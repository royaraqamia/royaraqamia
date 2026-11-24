import { describe, it, expect, vi } from 'vitest';
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

const BLOCKED_AUTHOR = '33333333-3333-4333-8333-333333333333';
const VIEWER = '44444444-4444-4444-8444-444444444444';

interface RpcCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * The block filter belongs to the SQL function, so the fake narrows rows BEFORE
 * the limit the way `post_comments_page` does. A repository that filtered after
 * paging would hand back a short page and fail these assertions.
 */
function createViewerClient(rows: StoredComment[], hidden: string[] = []) {
  const calls: RpcCall[] = [];
  const base = createClient(rows);
  const hiddenSet = new Set(hidden);

  const supabase = {
    ...base.supabase,
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      const cursorAt = args.p_cursor_at as string | null;
      const cursorId = args.p_cursor_id as string | null;
      const ordered = rows
        .filter((row) => row.deleted_at === null && !hiddenSet.has(row.author_id))
        .filter(
          (row) =>
            !cursorAt ||
            row.created_at < cursorAt ||
            (row.created_at === cursorAt && row.id < (cursorId ?? ''))
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
      return Promise.resolve({
        data: ordered.slice(0, (args.p_limit as number) + 1).map((row) => ({
          id: row.id,
          author_id: row.author_id,
          body: row.body,
          created_at: row.created_at,
          edited_at: row.edited_at,
        })),
        error: null,
      });
    },
  } as unknown as SupabaseClient<Database>;

  return { supabase, calls };
}

describe('listComments with a viewer', () => {
  it('filters before the keyset limit and keeps the public total', async () => {
    const rows = thread(23);
    rows[21] = { ...rows[21]!, author_id: BLOCKED_AUTHOR };
    rows[22] = { ...rows[22]!, author_id: BLOCKED_AUTHOR };
    const { supabase, calls } = createViewerClient(rows, [BLOCKED_AUTHOR]);
    const repo = createPostEngagementRepository(supabase);

    const page = await repo.listComments(POST_ID, null, 20, VIEWER);

    expect(page.rows).toHaveLength(20);
    expect(page.rows.some((row) => row.authorId === BLOCKED_AUTHOR)).toBe(false);
    expect(page.nextCursor).not.toBeNull();
    expect(page.total).toBe(23);
    expect(calls).toEqual([
      {
        name: 'post_comments_page',
        args: {
          p_post_id: POST_ID,
          p_viewer_id: VIEWER,
          p_cursor_at: null,
          p_cursor_id: null,
          p_limit: 20,
        },
      },
    ]);
  });

  it('passes the decoded cursor to the block-aware function on the next page', async () => {
    const { supabase, calls } = createViewerClient(thread(25));
    const repo = createPostEngagementRepository(supabase);

    const first = await repo.listComments(POST_ID, null, 20, VIEWER);
    await repo.listComments(POST_ID, first.nextCursor, 20, VIEWER);

    expect(calls).toHaveLength(2);
    expect(calls[1]?.args).toEqual({
      p_post_id: POST_ID,
      p_viewer_id: VIEWER,
      p_cursor_at: comment(5).created_at,
      p_cursor_id: comment(5).id,
      p_limit: 20,
    });
  });

  it('uses the plain table read for a guest so no block session is needed', async () => {
    const { supabase, calls } = createViewerClient(thread(20));
    const repo = createPostEngagementRepository(supabase);

    const page = await repo.listComments(POST_ID, null, 20, null);

    expect(page.rows).toHaveLength(20);
    expect(page.total).toBe(20);
    expect(calls).toHaveLength(0);
  });
});

describe('deleteComment', () => {
  it('passes the acting member under the function’s p_actor_id argument', async () => {
    const rpc = vi.fn(async () => ({
      data: [{ post_id: POST_ID, comment_count: 2 }],
      error: null,
    }));
    const supabase = { rpc } as unknown as SupabaseClient<Database>;
    const repo = createPostEngagementRepository(supabase);

    await expect(repo.deleteComment('c1', AUTHOR_ID)).resolves.toEqual({
      postId: POST_ID,
      commentCount: 2,
    });
    expect(rpc).toHaveBeenCalledWith('post_comment_delete', {
      p_comment_id: 'c1',
      p_actor_id: AUTHOR_ID,
    });
  });
});

describe('reportComment', () => {
  it('calls the reporting function with the member and the reason', async () => {
    const rpc = vi.fn(async () => ({
      data: [{ id: 'r1', created_at: '2026-01-01T00:00:00Z' }],
      error: null,
    }));
    const supabase = { rpc } as unknown as SupabaseClient<Database>;
    const repo = createPostEngagementRepository(supabase);

    await expect(repo.reportComment('c1', AUTHOR_ID, 'spam')).resolves.toEqual({
      id: 'r1',
      createdAt: '2026-01-01T00:00:00Z',
    });
    expect(rpc).toHaveBeenCalledWith('post_comment_report', {
      p_comment_id: 'c1',
      p_reporter_id: AUTHOR_ID,
      p_reason: 'spam',
    });
  });
});

describe('postAuthor', () => {
  it('reads the post owner for the host-removal check', async () => {
    const maybeSingle = vi.fn(async () => ({ data: { author_id: AUTHOR_ID }, error: null }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const supabase = {
      from: vi.fn(() => ({ select: () => ({ eq }) })),
    } as unknown as SupabaseClient<Database>;
    const repo = createPostEngagementRepository(supabase);

    await expect(repo.postAuthor(POST_ID)).resolves.toBe(AUTHOR_ID);
    expect(eq).toHaveBeenCalledWith('id', POST_ID);
  });
});

describe('commentWriteGate', () => {
  it('reads the gate from the database function', async () => {
    const rpc = vi.fn(async () => ({ data: 'blocked', error: null }));
    const supabase = { rpc } as unknown as SupabaseClient<Database>;
    const repo = createPostEngagementRepository(supabase);

    await expect(repo.commentWriteGate(POST_ID, AUTHOR_ID)).resolves.toBe('blocked');
    expect(rpc).toHaveBeenCalledWith('post_comment_write_gate', {
      p_post_id: POST_ID,
      p_author_id: AUTHOR_ID,
    });
  });
});
