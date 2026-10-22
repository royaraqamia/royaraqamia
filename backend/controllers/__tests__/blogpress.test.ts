import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAuthUser = vi.fn();
const mockPosts = {
  publishPost: vi.fn(),
};
const mockRepository = {
  createPost: vi.fn(),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
  listTagsByAuthor: vi.fn(),
};

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/backend/config/identity', async () => {
  const { identityDouble } = await import('@/backend/identity/__tests__/test-double');
  return identityDouble({
    session: async () => {
      const { user, supabase } = await mockGetAuthUser();
      return { user, client: supabase };
    },
  });
});

vi.mock('@/backend/config/blogpress', () => ({
  createBlogpressPostsModule: () => ({ posts: mockPosts, repository: mockRepository }),
  createBlogpressMediaService: () => ({}),
}));

vi.mock('@/backend/config/plans', () => ({
  createPlanGate: () => ({
    meter: async (_subject: unknown, _action: string, run: () => Promise<unknown>) => run(),
    meterMany: async (_u: string, _a: string, _c: number, run: () => Promise<unknown>) => run(),
    reserve: async () => 'event-1',
    release: async () => {},
    cap: async () => {},
    caps: async () => ({ plan: 'free', unlimited: false, caps: {} }),
    report: async () => ({ recorded: 0, alreadyRecorded: 0, refused: 0 }),
  }),
}));

import {
  createPost,
  deletePost,
  listBlogTags,
  publishPost,
  updatePost,
} from '@/backend/controllers/blogpress';

describe('blogpress controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUser.mockResolvedValue({
      user: { id: 'u-1', email: 'author@b.com' },
      supabase: {},
    });
    mockRepository.createPost.mockResolvedValue({ id: 'p-1' });
    mockRepository.updatePost.mockResolvedValue(undefined);
    mockRepository.deletePost.mockResolvedValue({ slug: 'hello' });
    mockRepository.listTagsByAuthor.mockResolvedValue([]);
    mockPosts.publishPost.mockResolvedValue({ slug: 'hello' });
  });

  it('returns 401 when there is no session user', async () => {
    mockGetAuthUser.mockResolvedValue({ user: null, supabase: {} });

    const result = await createPost();

    expect(result).toEqual(expect.objectContaining({ status: 401, body: { error: 'غير مصرح' } }));
    expect(mockRepository.createPost).not.toHaveBeenCalled();
  });

  it('passes the session identity into publish', async () => {
    const result = await publishPost('p-1');

    expect(result).toMatchObject({ status: 200 });
    expect(mockPosts.publishPost).toHaveBeenCalledWith('p-1', 'u-1');
  });

  it('maps a post failure to 500 with the message under the "error" key', async () => {
    mockRepository.updatePost.mockRejectedValue(new Error('فشل حفظ المنشور'));

    const result = await updatePost('p-1', { title: 'عنوان', slug: 'hello' });

    expect(result).toEqual(
      expect.objectContaining({ status: 500, body: { error: 'فشل حفظ المنشور' } })
    );
  });

  it('returns field errors at 200 without calling the module', async () => {
    const result = await updatePost('p-1', { slug: 123 });

    expect(result).toEqual(
      expect.objectContaining({
        status: 200,
        body: expect.objectContaining({ errors: expect.any(Object) }),
      })
    );
    expect(mockRepository.updatePost).not.toHaveBeenCalled();
  });

  it('maps a listing failure to 500', async () => {
    mockRepository.listTagsByAuthor.mockRejectedValue(new Error('db down'));

    const result = await listBlogTags();

    expect(result).toEqual(expect.objectContaining({ status: 500, body: { error: 'db down' } }));
  });

  it('threads the Outbox write time into the delete so the tombstone keeps order', async () => {
    const result = await deletePost('p-1', { updatedAt: '2026-10-18T09:00:00.000Z' });

    expect(mockRepository.deletePost).toHaveBeenCalledWith(
      'p-1',
      'u-1',
      '2026-10-18T09:00:00.000Z'
    );
    expect(result).toMatchObject({
      status: 200,
      body: { success: true },
      revalidate: [{ path: '/blogpress' }, { path: '/community/hello' }, { path: '/community' }],
    });
  });

  it('replays an already-gone delete as success without a revalidation target', async () => {
    mockRepository.deletePost.mockResolvedValue({ slug: null });

    const result = await deletePost('p-1', { updatedAt: '2026-10-18T09:00:00.000Z' });

    expect(result).toMatchObject({ status: 200, body: { success: true }, revalidate: [] });
  });

  it('maps a delete failure to 500', async () => {
    mockRepository.deletePost.mockRejectedValue(new Error('فشل حذف المنشور'));

    const result = await deletePost('p-1', null);

    expect(result).toEqual(
      expect.objectContaining({ status: 500, body: { error: 'فشل حذف المنشور' } })
    );
  });
});
