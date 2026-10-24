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
  bulkActionPosts: vi.fn(),
};
const mockRepository = {
  createPost: vi.fn(),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
  bulkSetPostCategories: vi.fn(),
  resolveBulkPublishTargets: vi.fn(),
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
  bulkPostsAction,
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
    mockPosts.createAndPublishPost.mockResolvedValue({ id: 'p-9', slug: 'post-abc12345' });
    mockPosts.bulkActionPosts.mockResolvedValue({ affected: 0, slugs: [] });
    mockRepository.resolveBulkPublishTargets.mockResolvedValue({
      transitionIds: [],
      alreadyPublishedIds: [],
    });
    mockRepository.bulkSetPostCategories.mockResolvedValue(undefined);
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
});

describe('blogpress bulk publish', () => {
  const P1 = '00000000-0000-4000-8000-000000000001';
  const P2 = '00000000-0000-4000-8000-000000000002';
  const P3 = '00000000-0000-4000-8000-000000000003';
  const P4 = '00000000-0000-4000-8000-000000000004';
  const P5 = '00000000-0000-4000-8000-000000000005';
  const P6 = '00000000-0000-4000-8000-000000000006';
  const requested = [P1, P2, P3, P4, P5];

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUser.mockResolvedValue({
      user: { id: 'u-1', email: 'author@b.com' },
      supabase: {},
    });
    planMocks.cap.mockResolvedValue(undefined);
    planMocks.meterMany.mockImplementation(
      async (_u: string, _a: string, _c: number, run: () => Promise<unknown>) => run()
    );
  });

  it('caps and meters only the posts that will transition', async () => {
    mockRepository.resolveBulkPublishTargets.mockResolvedValue({
      transitionIds: [P1, P2, P3],
      alreadyPublishedIds: [P4, P5],
    });
    mockPosts.bulkActionPosts.mockResolvedValue({
      affected: 3,
      slugs: ['a', 'b', 'c'],
    });

    const result = await bulkPostsAction({ action: 'publish', postIds: requested });

    expect(mockRepository.resolveBulkPublishTargets).toHaveBeenCalledWith(requested, 'u-1');
    expect(planMocks.cap).toHaveBeenCalledWith('u-1', 'community_published', 3);
    expect(planMocks.meterMany).toHaveBeenCalledWith(
      'u-1',
      'community.post.publish',
      3,
      expect.any(Function)
    );
    expect(mockPosts.bulkActionPosts).toHaveBeenCalledWith([P1, P2, P3], 'u-1', 'publish');
    expect(result).toMatchObject({ status: 200, body: { success: true, affected: 3 } });
  });

  it('charges duplicate ids once', async () => {
    mockRepository.resolveBulkPublishTargets.mockResolvedValue({
      transitionIds: [P1, P2],
      alreadyPublishedIds: [],
    });
    mockPosts.bulkActionPosts.mockResolvedValue({ affected: 2, slugs: ['a', 'b'] });

    const result = await bulkPostsAction({
      action: 'publish',
      postIds: [P1, P1, P2, P2],
    });

    expect(mockRepository.resolveBulkPublishTargets).toHaveBeenCalledWith([P1, P2], 'u-1');
    expect(planMocks.cap).toHaveBeenCalledWith('u-1', 'community_published', 2);
    expect(planMocks.meterMany).toHaveBeenCalledWith(
      'u-1',
      'community.post.publish',
      2,
      expect.any(Function)
    );
    expect(mockPosts.bulkActionPosts).toHaveBeenCalledWith([P1, P2], 'u-1', 'publish');
    expect(result).toMatchObject({ status: 200, body: { success: true, affected: 2 } });
  });

  it('charges nothing for ids the caller does not own', async () => {
    mockRepository.resolveBulkPublishTargets.mockResolvedValue({
      transitionIds: [P1],
      alreadyPublishedIds: [],
    });
    mockPosts.bulkActionPosts.mockResolvedValue({ affected: 1, slugs: ['a'] });

    const result = await bulkPostsAction({
      action: 'publish',
      postIds: [P1, P6],
    });

    expect(planMocks.cap).toHaveBeenCalledWith('u-1', 'community_published', 1);
    expect(planMocks.meterMany).toHaveBeenCalledWith(
      'u-1',
      'community.post.publish',
      1,
      expect.any(Function)
    );
    expect(mockPosts.bulkActionPosts).toHaveBeenCalledWith([P1], 'u-1', 'publish');
    expect(result).toMatchObject({ status: 200, body: { success: true, affected: 1 } });
  });

  it('does nothing when every selected post is already published', async () => {
    mockRepository.resolveBulkPublishTargets.mockResolvedValue({
      transitionIds: [],
      alreadyPublishedIds: [P4, P5],
    });

    const result = await bulkPostsAction({
      action: 'publish',
      postIds: [P4, P5],
    });

    expect(planMocks.cap).not.toHaveBeenCalled();
    expect(planMocks.meterMany).not.toHaveBeenCalled();
    expect(mockPosts.bulkActionPosts).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 200, body: { success: true, affected: 0 } });
  });

  it('rejects a selection above the bound before touching the module', async () => {
    const tooMany = Array.from(
      { length: 101 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
    );

    const result = await bulkPostsAction({ action: 'publish', postIds: tooMany });

    expect(result).toEqual(expect.objectContaining({ status: 400 }));
    expect(mockRepository.resolveBulkPublishTargets).not.toHaveBeenCalled();
    expect(mockPosts.bulkActionPosts).not.toHaveBeenCalled();
  });
});
