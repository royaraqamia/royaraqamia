import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAuthUser = vi.fn();
const planMocks = vi.hoisted(() => ({
  cap: vi.fn(),
  meter: vi.fn(),
  meterMany: vi.fn(),
}));
const mockPosts = {
  publishPost: vi.fn(),
  createAndPublishPost: vi.fn(),
  restorePost: vi.fn(),
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
    meter: planMocks.meter,
    meterMany: planMocks.meterMany,
    reserve: async () => 'event-1',
    release: async () => {},
    cap: planMocks.cap,
    caps: async () => ({ plan: 'free', unlimited: false, caps: {} }),
    report: async () => ({ recorded: 0, alreadyRecorded: 0, refused: 0 }),
  }),
}));

import {
  createPost,
  deletePost,
  listBlogTags,
  publishPost,
  restorePost,
  updatePost,
} from '@/backend/controllers/blogpress';
import { AppError } from '@/backend/shared/errors';

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
    mockPosts.createAndPublishPost.mockResolvedValue({ id: 'p-9', slug: 'post-abc12345' });
    mockPosts.restorePost.mockResolvedValue({ id: 'p-1' });
    planMocks.cap.mockResolvedValue(undefined);
    planMocks.meter.mockImplementation(
      async (_subject: unknown, _action: string, run: () => Promise<unknown>) => run()
    );
    planMocks.meterMany.mockImplementation(
      async (_u: string, _a: string, _c: number, run: () => Promise<unknown>) => run()
    );
  });

  it('returns 401 when there is no session user', async () => {
    mockGetAuthUser.mockResolvedValue({ user: null, supabase: {} });

    const result = await createPost();

    expect(result).toEqual(expect.objectContaining({ status: 401, body: { error: 'غير مصرح' } }));
    expect(mockRepository.createPost).not.toHaveBeenCalled();
  });

  it('creates a draft through the draft cap, not the publish gate', async () => {
    const result = await createPost({ slug: 'draft-post', content: 'مسوَّدة' });

    expect(mockRepository.createPost).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ slug: 'draft-post', content: 'مسوَّدة' })
    );
    expect(planMocks.cap).toHaveBeenCalledWith('u-1', 'community_drafts');
    expect(planMocks.meter).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 200, body: { id: 'p-1' } });
  });

  it('creates and publishes a new post in one metered request', async () => {
    const result = await createPost({
      slug: 'post-abc12345',
      content: 'منشور جديد',
      status: 'published',
    });

    expect(planMocks.cap).toHaveBeenCalledWith('u-1', 'community_published');
    expect(planMocks.meter).toHaveBeenCalledTimes(1);
    expect(planMocks.meter).toHaveBeenCalledWith(
      { userId: 'u-1' },
      'community.post.publish',
      expect.any(Function)
    );
    expect(mockPosts.createAndPublishPost).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ slug: 'post-abc12345', content: 'منشور جديد', status: 'published' })
    );
    expect(mockRepository.createPost).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 200,
      body: { id: 'p-9', slug: 'post-abc12345' },
      revalidate: expect.arrayContaining([{ path: '/community/post-abc12345' }]),
    });
  });

  it('writes nothing when the published cap refuses the new post', async () => {
    planMocks.cap.mockRejectedValue(new Error('cap reached'));

    const result = await createPost({
      slug: 'post-abc12345',
      content: 'منشور جديد',
      status: 'published',
    });

    expect(result).toEqual(expect.objectContaining({ status: 500 }));
    expect(planMocks.meter).not.toHaveBeenCalled();
    expect(mockPosts.createAndPublishPost).not.toHaveBeenCalled();
    expect(mockRepository.createPost).not.toHaveBeenCalled();
  });

  it('writes nothing when the publish credit is refused', async () => {
    planMocks.meter.mockRejectedValue(new Error('no credits'));

    const result = await createPost({
      slug: 'post-abc12345',
      content: 'منشور جديد',
      status: 'published',
    });

    expect(result).toEqual(expect.objectContaining({ status: 500 }));
    expect(mockPosts.createAndPublishPost).not.toHaveBeenCalled();
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

  it('restores with only the content fields, dropping forged server-owned values', async () => {
    const result = await restorePost({
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'hello',
      content: 'body',
      cover_image: null,
      meta_title: null,
      meta_desc: null,
      status: 'published',
      published_at: '2026-10-01T09:00:00.000Z',
      view_count: 999,
      featured: true,
      community_visible: true,
      reading_time_minutes: 99,
    });

    expect(mockPosts.restorePost).toHaveBeenCalledWith('u-1', {
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'hello',
      content: 'body',
      cover_image: null,
      meta_title: null,
      meta_desc: null,
    });
    expect(result).toMatchObject({ status: 200, body: { success: true, id: 'p-1' } });
  });

  it('maps a restore with no owned tombstone to 404', async () => {
    mockPosts.restorePost.mockRejectedValue(new AppError('المنشور المحذوف غير موجود', 404));

    const result = await restorePost({
      slug: 'hello',
      content: 'body',
      cover_image: null,
      meta_title: null,
      meta_desc: null,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 404,
        body: { error: 'المنشور المحذوف غير موجود' },
      })
    );
  });
});
