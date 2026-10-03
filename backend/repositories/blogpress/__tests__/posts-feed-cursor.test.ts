import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createPostsRepository } from '@/backend/repositories/blogpress/posts';
import {
  decodeFeedCursor,
  encodeFeedCursor,
  feedCursorFilter,
} from '@/backend/repositories/blogpress/feed-cursor';
import { RepositoryError } from '@/backend/shared/repository-error';

const POST = {
  id: '11111111-1111-1111-1111-111111111111',
  published_at: '2026-08-01T10:00:00.000Z',
};

function row(id: string, publishedAt: string | null) {
  return { id, published_at: publishedAt };
}

function createClient(rows: unknown[], error: unknown = null) {
  const orFilters: string[] = [];
  const limits: number[] = [];
  const orders: string[] = [];
  const builder = {
    select: vi.fn(() => builder),
    or: vi.fn((filter: string) => {
      orFilters.push(filter);
      return builder;
    }),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn((column: string) => {
      orders.push(column);
      return builder;
    }),
    limit: vi.fn((count: number) => {
      limits.push(count);
      return { data: rows, error };
    }),
  };
  const supabase = { from: vi.fn(() => builder) };
  return { supabase, orFilters, limits, orders };
}

describe('feed cursor encoding', () => {
  it('round-trips a non-null cursor', () => {
    const cursor = { publishedAt: '2026-08-01T10:00:00.000Z', id: POST.id };
    expect(decodeFeedCursor(encodeFeedCursor(cursor))).toEqual(cursor);
  });

  it('round-trips a null published_at cursor', () => {
    const cursor = { publishedAt: null, id: POST.id };
    expect(decodeFeedCursor(encodeFeedCursor(cursor))).toEqual(cursor);
  });

  it('rejects a cursor whose timestamp smuggles filter delimiters', () => {
    const forged = Buffer.from(
      JSON.stringify({ p: '2026-08-01T10:00:00.000Z,id.gt.0', i: POST.id })
    ).toString('base64url');
    expect(decodeFeedCursor(forged)).toBeNull();
  });

  it('rejects a cursor with a malformed id', () => {
    const forged = Buffer.from(JSON.stringify({ p: null, i: 'not-a-uuid' })).toString('base64url');
    expect(decodeFeedCursor(forged)).toBeNull();
  });

  it('rejects undecodable garbage', () => {
    expect(decodeFeedCursor('!!!not-base64!!!')).toBeNull();
  });
});

describe('feed cursor filter', () => {
  it('uses the (published_at, id) comparison for a dated cursor', () => {
    expect(feedCursorFilter({ publishedAt: '2026-08-01T10:00:00.000Z', id: POST.id })).toBe(
      `published_at.lt.2026-08-01T10:00:00.000Z,and(published_at.eq.2026-08-01T10:00:00.000Z,id.lt.${POST.id})`
    );
  });

  it('handles NULLS FIRST for a null cursor', () => {
    expect(feedCursorFilter({ publishedAt: null, id: POST.id })).toBe(
      `and(published_at.is.null,id.lt.${POST.id}),published_at.not.is.null`
    );
  });
});

describe('getPublishedFeed', () => {
  it('returns a full page plus a cursor when an extra row exists', async () => {
    const rows = Array.from({ length: 11 }, (_, i) =>
      row(
        `00000000-0000-0000-0000-00000000000${String(i).padStart(1, '0')}`,
        '2026-08-01T10:00:00.000Z'
      )
    );
    const { supabase, limits, orders } = createClient(rows);
    const repo = createPostsRepository(supabase as unknown as SupabaseClient<Database>);

    const result = await repo.getPublishedFeed(null, '', 10);

    expect(result.posts).toHaveLength(10);
    expect(limits).toEqual([11]);
    expect(orders).toEqual(['published_at', 'id']);
    expect(decodeFeedCursor(result.nextCursor as string)).toEqual({
      publishedAt: '2026-08-01T10:00:00.000Z',
      id: '00000000-0000-0000-0000-000000000009',
    });
  });

  it('returns a null cursor on the last page', async () => {
    const { supabase } = createClient([POST]);
    const repo = createPostsRepository(supabase as unknown as SupabaseClient<Database>);

    const result = await repo.getPublishedFeed(null, '', 10);

    expect(result.posts).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it('applies the keyset filter for a valid cursor', async () => {
    const { supabase, orFilters } = createClient([]);
    const repo = createPostsRepository(supabase as unknown as SupabaseClient<Database>);
    const cursor = encodeFeedCursor({ publishedAt: POST.published_at, id: POST.id });

    await repo.getPublishedFeed(cursor, '', 10);

    expect(orFilters).toContain(
      `published_at.lt.${POST.published_at},and(published_at.eq.${POST.published_at},id.lt.${POST.id})`
    );
  });

  it('does not apply a keyset filter for a malformed cursor (first page)', async () => {
    const { supabase, orFilters } = createClient([]);
    const repo = createPostsRepository(supabase as unknown as SupabaseClient<Database>);

    await repo.getPublishedFeed('garbage', '', 10);

    expect(orFilters.every((filter) => !filter.includes('published_at.lt.'))).toBe(true);
  });

  it('throws a RepositoryError on a database error', async () => {
    const { supabase } = createClient([], { message: 'db down', code: '08006' });
    const repo = createPostsRepository(supabase as unknown as SupabaseClient<Database>);

    await expect(repo.getPublishedFeed(null, '', 10)).rejects.toBeInstanceOf(RepositoryError);
  });
});
