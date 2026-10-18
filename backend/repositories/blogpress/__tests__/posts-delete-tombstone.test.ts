import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createPostsRepository } from '@/backend/repositories/blogpress/posts';

const DB_ERROR = { message: 'db down', code: '08006' };
const NO_ROWS = { message: 'no rows', code: 'PGRST116' };

/**
 * Records the PostgREST chain a call builds. A delete is only a tombstone if
 * it issues an `update` (never a `delete`) behind the LWW guard, and a read only
 * hides tombstones if it carries `deleted_at is null`.
 */
function createClient(result: unknown) {
  const calls: string[] = [];
  const updates: Array<Record<string, unknown>> = [];

  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.update = vi.fn((payload: Record<string, unknown>) => {
    updates.push(payload);
    calls.push('update');
    return builder;
  });
  builder.delete = vi.fn(() => {
    calls.push('delete');
    return builder;
  });
  for (const method of ['or', 'in', 'order']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.eq = vi.fn((column: string, value: unknown) => {
    calls.push(`eq ${column}=${String(value)}`);
    return builder;
  });
  builder.is = vi.fn((column: string, value: unknown) => {
    calls.push(`is ${column}=${String(value)}`);
    return builder;
  });
  builder.lte = vi.fn((column: string, value: unknown) => {
    calls.push(`lte ${column}=${String(value)}`);
    return builder;
  });
  builder.then = (onFulfilled: (value: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.range = vi.fn(() => Promise.resolve(result));
  builder.limit = vi.fn(() => Promise.resolve(result));

  return {
    client: { from: vi.fn(() => builder) } as unknown as SupabaseClient<Database>,
    calls,
    updates,
  };
}

const STAMP = '2026-10-18T09:00:00.000Z';

/** The single update payload a tombstone must produce. */
function onlyUpdate(updates: Array<Record<string, unknown>>): Record<string, unknown> {
  expect(updates).toHaveLength(1);
  const payload = updates[0];
  if (!payload) throw new Error('expected exactly one update payload');
  return payload;
}

describe('blogpress post delete tombstones instead of removing the row', () => {
  it('stamps deleted_at/updated_at with the client write time behind the LWW guard', async () => {
    const { client, calls, updates } = createClient({ data: { slug: 'hello' }, error: null });
    const repo = createPostsRepository(client);

    await expect(repo.deletePost('p-1', 'u-1', STAMP)).resolves.toEqual({ slug: 'hello' });

    expect(updates).toEqual([{ deleted_at: STAMP, updated_at: STAMP }]);
    expect(calls).toContain('eq id=p-1');
    expect(calls).toContain('eq author_id=u-1');
    expect(calls).toContain(`lte updated_at=${STAMP}`);
    // A hard delete would lose the row identity the replay needs.
    expect(calls).not.toContain('delete');
  });

  it('falls back to the server clock when the intent carries no timestamp', async () => {
    const { client, calls, updates } = createClient({ data: { slug: 'hello' }, error: null });
    const repo = createPostsRepository(client);

    await repo.deletePost('p-1', 'u-1');

    const payload = onlyUpdate(updates);
    expect(typeof payload.deleted_at).toBe('string');
    expect(payload.deleted_at).toBe(payload.updated_at);
    expect(calls).toContain(`lte updated_at=${String(payload.deleted_at)}`);
  });

  it('resolves a replayed delete of a row that is already gone', async () => {
    // The tombstone write matched nothing: `.single()` would raise PGRST116 and
    // the Outbox would retry forever.
    const { client } = createClient({ data: null, error: null });
    const repo = createPostsRepository(client);

    await expect(repo.deletePost('p-1', 'u-1', STAMP)).resolves.toEqual({ slug: null });
  });

  it('still throws when the tombstone write itself fails', async () => {
    const { client } = createClient({ data: null, error: DB_ERROR });
    const repo = createPostsRepository(client);

    await expect(repo.deletePost('p-1', 'u-1', STAMP)).rejects.toThrow('فشل حذف المنشور');
  });

  it('tombstones a bulk delete with the same guard', async () => {
    const { client, calls, updates } = createClient({
      data: [{ slug: 'hello' }, { slug: 'world' }],
      error: null,
    });
    const repo = createPostsRepository(client);

    await expect(repo.bulkActionPosts(['p-1', 'p-2'], 'u-1', 'delete')).resolves.toEqual({
      affected: 2,
      slugs: ['hello', 'world'],
    });

    expect(updates).toHaveLength(1);
    const payload = onlyUpdate(updates);
    expect(typeof payload.deleted_at).toBe('string');
    expect(calls).toContain(`lte updated_at=${String(payload.deleted_at)}`);
    expect(calls).not.toContain('delete');
  });

  it('resolves a replayed bulk delete as a no-op success', async () => {
    const { client } = createClient({ data: [], error: null });
    const repo = createPostsRepository(client);

    await expect(repo.bulkActionPosts(['p-1'], 'u-1', 'delete')).resolves.toEqual({
      affected: 0,
      slugs: [],
    });
  });
});

describe('tombstoned posts are invisible to every read path', () => {
  it('excludes them from the published list and feed', async () => {
    const list = createClient({ data: [], count: 0, error: null });
    await createPostsRepository(list.client).getPublishedPosts(1, '', 10);
    expect(list.calls).toContain('is deleted_at=null');

    const feed = createClient({ data: [], error: null });
    await createPostsRepository(feed.client).getPublishedFeed(null, '', 10);
    expect(feed.calls).toContain('is deleted_at=null');
  });

  it('excludes them from the author list and the post detail reads', async () => {
    const author = createClient({ data: [], error: null });
    await createPostsRepository(author.client).listPostsByAuthor('u-1');
    expect(author.calls).toContain('is deleted_at=null');

    const owned = createClient({ data: null, error: NO_ROWS });
    await expect(
      createPostsRepository(owned.client).getPostForUser('p-1', 'u-1')
    ).resolves.toBeNull();
    expect(owned.calls).toContain('is deleted_at=null');

    const detail = createClient({ data: null, error: NO_ROWS });
    await expect(
      createPostsRepository(detail.client).getPublishedPostBySlug('hello')
    ).resolves.toBeNull();
    expect(detail.calls).toContain('is deleted_at=null');

    const excerpt = createClient({ data: null, error: NO_ROWS });
    await expect(
      createPostsRepository(excerpt.client).getPostExcerptById('p-1')
    ).resolves.toBeNull();
    expect(excerpt.calls).toContain('is deleted_at=null');
  });

  it('excludes them from the sitemap reads', async () => {
    const slugs = createClient({ data: [], error: null });
    await createPostsRepository(slugs.client).getPublishedPostSlugs();
    expect(slugs.calls).toContain('is deleted_at=null');

    const entries = createClient({ data: [], error: null });
    await createPostsRepository(entries.client).getPublishedPostSitemapEntries();
    expect(entries.calls).toContain('is deleted_at=null');
  });
});
