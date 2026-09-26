import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createPostsRepository } from '@/backend/repositories/blogpress/posts';
import { RepositoryError } from '@/backend/shared/repository-error';

const { loggerError, captureException } = vi.hoisted(() => ({
  loggerError: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@/backend/shared/logger', () => ({
  logger: { error: loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@sentry/nextjs', () => ({ captureException }));

function makeClient(result: unknown, rpcResult: unknown = { error: null }) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const method of ['select', 'eq', 'or', 'order', 'range', 'in']) {
    builder[method] = vi.fn(chain);
  }
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.then = (onFulfilled: (value: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  const from = vi.fn(() => builder);
  const rpc = vi.fn(() => Promise.resolve(rpcResult));
  return { client: { from, rpc } as unknown as SupabaseClient<Database> };
}

const DB_ERROR = { message: 'db down', code: '08006' };
const NO_ROWS = { message: 'no rows', code: 'PGRST116' };

const POST = {
  id: 'p-1',
  author_id: 'u-1',
  title: 'عنوان',
  slug: 'hello',
  content: null,
  status: 'published',
  cover_image: null,
  meta_title: null,
  meta_desc: null,
  published_at: '2026-08-01T10:00:00.000Z',
  publish_at: null,
  view_count: 0,
  featured: false,
  blog_visible: true,
  reading_time_minutes: 1,
  created_at: '2026-08-01T10:00:00.000Z',
  updated_at: '2026-08-01T10:00:00.000Z',
};

describe('blogpress posts repository failure contract', () => {
  it('throws a RepositoryError from getPublishedPostBySlug on a database error', async () => {
    const repo = createPostsRepository(makeClient({ data: null, error: DB_ERROR }).client);

    await expect(repo.getPublishedPostBySlug('hello')).rejects.toBeInstanceOf(RepositoryError);
    expect(loggerError).toHaveBeenCalledTimes(1);
  });

  it('returns null from getPublishedPostBySlug only when the post is absent', async () => {
    const repo = createPostsRepository(makeClient({ data: null, error: NO_ROWS }).client);

    await expect(repo.getPublishedPostBySlug('missing')).resolves.toBeNull();
  });

  it('returns the post when it exists', async () => {
    const repo = createPostsRepository(makeClient({ data: POST, error: null }).client);

    await expect(repo.getPublishedPostBySlug('hello')).resolves.toEqual(POST);
  });

  it('throws from getPublishedPosts instead of reporting an empty feed', async () => {
    const repo = createPostsRepository(makeClient({ data: null, error: DB_ERROR }).client);

    await expect(repo.getPublishedPosts(1, '', 10)).rejects.toBeInstanceOf(RepositoryError);
  });

  it('returns an empty feed only when there are no posts', async () => {
    const repo = createPostsRepository(makeClient({ data: null, count: null, error: null }).client);

    await expect(repo.getPublishedPosts(1, '', 10)).resolves.toEqual({ posts: [], totalPages: 0 });
  });

  it('throws from getPublishedPostSlugs on a database error', async () => {
    const repo = createPostsRepository(makeClient({ data: null, error: DB_ERROR }).client);

    await expect(repo.getPublishedPostSlugs()).rejects.toBeInstanceOf(RepositoryError);
  });

  it('throws from getPostAuthor on a database error', async () => {
    const repo = createPostsRepository(makeClient({ data: null, error: DB_ERROR }).client);

    await expect(repo.getPostAuthor('u-1')).rejects.toBeInstanceOf(RepositoryError);
  });

  it('throws from getPublishedCategories on a database error', async () => {
    const repo = createPostsRepository(makeClient({ data: null, error: DB_ERROR }).client);

    await expect(repo.getPublishedCategories()).rejects.toBeInstanceOf(RepositoryError);
  });

  it('throws from listPostsByAuthor on a database error', async () => {
    const repo = createPostsRepository(makeClient({ data: null, error: DB_ERROR }).client);

    await expect(repo.listPostsByAuthor('u-1')).rejects.toBeInstanceOf(RepositoryError);
  });

  it('throws from getPostTagsByPostIds on a database error', async () => {
    const repo = createPostsRepository(makeClient({ data: null, error: DB_ERROR }).client);

    await expect(repo.getPostTagsByPostIds(['p-1'])).rejects.toBeInstanceOf(RepositoryError);
  });

  it('throws from incrementPostViewCount when the RPC fails', async () => {
    const repo = createPostsRepository(
      makeClient({ data: null, error: null }, { error: DB_ERROR }).client
    );

    await expect(repo.incrementPostViewCount('p-1')).rejects.toBeInstanceOf(RepositoryError);
  });
});
