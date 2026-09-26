import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAuthUser = vi.fn();
const mockPosts = {
  publishPost: vi.fn(),
};
const mockRepository = {
  createPost: vi.fn(),
  updatePost: vi.fn(),
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

import { createPost, listBlogTags, publishPost, updatePost } from '@/backend/controllers/blogpress';

describe('blogpress controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUser.mockResolvedValue({
      user: { id: 'u-1', email: 'author@b.com' },
      supabase: {},
    });
    mockRepository.createPost.mockResolvedValue({ id: 'p-1' });
    mockRepository.updatePost.mockResolvedValue(undefined);
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
    expect(mockPosts.publishPost).toHaveBeenCalledWith('p-1', 'u-1', 'author@b.com');
  });

  it('maps a post failure to 500 with the message under the "message" key', async () => {
    mockRepository.updatePost.mockRejectedValue(new Error('فشل حفظ المقال'));

    const result = await updatePost('p-1', { title: 'عنوان', slug: 'hello' });

    expect(result).toEqual(
      expect.objectContaining({ status: 500, body: { message: 'فشل حفظ المقال' } })
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
});
