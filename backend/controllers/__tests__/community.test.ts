import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommunityPostViewRateLimitError } from '@/backend/services/blogpress/community-view-recorder';

const mockRecordCommunityPostView = vi.fn();
const mockLoadCommunityPost = vi.fn();
const mockLoadCommunityMember = vi.fn();
const mockCreatePostEngagementService = vi.fn();
const mockGetOptionalUser = vi.fn();

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/backend/middleware/auth-guard', () => ({
  getOptionalUser: () => mockGetOptionalUser(),
}));

vi.mock('@/backend/config/community', () => ({
  recordCommunityPostView: (...args: unknown[]) => mockRecordCommunityPostView(...args),
  createPostEngagementService: (...args: unknown[]) => mockCreatePostEngagementService(...args),
}));

vi.mock('@/backend/loaders/community', () => ({
  loadCommunityPost: (...args: unknown[]) => mockLoadCommunityPost(...args),
  loadCommunityMember: (...args: unknown[]) => mockLoadCommunityMember(...args),
}));

import {
  editPostComment,
  getCommunityMember,
  getCommunityPost,
  getPostComments,
  recordPostView,
  removePostComment,
} from '@/backend/controllers/community';

describe('community view controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordCommunityPostView.mockResolvedValue(undefined);
  });

  it('records a view for a valid slug', async () => {
    const result = await recordPostView('my-post', '1.2.3.4');

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(mockRecordCommunityPostView).toHaveBeenCalledWith('my-post', '1.2.3.4');
  });

  it('returns 400 for an invalid slug', async () => {
    const result = await recordPostView('bad slug!!', '1.2.3.4');

    expect(result).toEqual(expect.objectContaining({ status: 400 }));
    expect(mockRecordCommunityPostView).not.toHaveBeenCalled();
  });

  it('returns 429 when the per-IP or per-slug limit is exceeded', async () => {
    mockRecordCommunityPostView.mockRejectedValue(new CommunityPostViewRateLimitError());

    const result = await recordPostView('my-post', '1.2.3.4');

    expect(result).toEqual(
      expect.objectContaining({ status: 429, body: expect.objectContaining({ success: false }) })
    );
  });

  it('returns 500 when the increment fails', async () => {
    mockRecordCommunityPostView.mockRejectedValue(new Error('db down'));

    const result = await recordPostView('my-post', '1.2.3.4');

    expect(result).toEqual(
      expect.objectContaining({ status: 500, body: expect.objectContaining({ success: false }) })
    );
  });
});

describe('community post controller', () => {
  const post = {
    id: 'p-1',
    author_id: 'u-1',
    slug: 'my-post',
    content: '## مرحبًا',
    status: 'published',
    cover_image: null,
    meta_title: null,
    meta_desc: null,
    published_at: '2026-01-01T00:00:00.000Z',
    publish_at: null,
    view_count: 3,
    featured: false,
    community_visible: true,
    reading_time_minutes: 2,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('answers the post with its public publisher and its tags', async () => {
    mockLoadCommunityPost.mockResolvedValue({
      post,
      author: {
        username: 'ahmad',
        name: 'أحمد',
        avatar_url: null,
        bio: 'a private column the contract does not carry',
      },
      postTags: [{ id: 't-1', name: 'تقنية', slug: 'tech' }],
    });

    const result = await getCommunityPost('my-post');

    expect(result).toEqual(
      expect.objectContaining({
        status: 200,
        body: {
          post: {
            ...post,
            author: { username: 'ahmad', name: 'أحمد', avatar_url: null },
          },
          postTags: [{ id: 't-1', name: 'تقنية', slug: 'tech' }],
        },
      })
    );
    expect(mockLoadCommunityPost).toHaveBeenCalledWith('my-post');
  });

  it('answers 404 when the loader has no published post', async () => {
    mockLoadCommunityPost.mockResolvedValue(null);

    const result = await getCommunityPost('missing-post');

    expect(result).toEqual(expect.objectContaining({ status: 404 }));
  });

  it('rejects an invalid slug without reading the loader', async () => {
    const result = await getCommunityPost('bad slug!!');

    expect(result).toEqual(expect.objectContaining({ status: 404 }));
    expect(mockLoadCommunityPost).not.toHaveBeenCalled();
  });

  it('answers 500 with the page-level sentence when the read fails', async () => {
    mockLoadCommunityPost.mockRejectedValue(new Error('db down'));

    const result = await getCommunityPost('my-post');

    expect(result).toEqual(
      expect.objectContaining({
        status: 500,
        body: expect.objectContaining({ error: 'تعذَّر تحميل المنشور.' }),
      })
    );
  });
});

describe('community member controller', () => {
  const member = {
    id: 'u-1',
    username: 'ahmad',
    name: 'أحمد',
    avatar_url: null,
    bio: 'كاتب',
    verified: true,
    is_hidden: false,
  };
  const post = {
    id: 'p-1',
    author_id: 'u-1',
    slug: 'my-post',
    content: '## مرحبًا',
    status: 'published',
    cover_image: null,
    meta_title: null,
    meta_desc: null,
    published_at: '2026-01-01T00:00:00.000Z',
    publish_at: null,
    view_count: 3,
    featured: false,
    community_visible: true,
    reading_time_minutes: 2,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('answers the member and their first page without the hidden flag', async () => {
    mockLoadCommunityMember.mockResolvedValue({
      member,
      posts: [post],
      nextCursor: null,
    });

    const result = await getCommunityMember('ahmad');

    expect(result).toEqual(
      expect.objectContaining({
        status: 200,
        body: {
          member: {
            id: 'u-1',
            username: 'ahmad',
            name: 'أحمد',
            avatar_url: null,
            bio: 'كاتب',
            verified: true,
          },
          posts: [post],
          nextCursor: null,
        },
      })
    );
    expect(mockLoadCommunityMember).toHaveBeenCalledWith('ahmad');
  });

  it('decodes a percent-encoded Arabic handle before the read', async () => {
    mockLoadCommunityMember.mockResolvedValue({ member, posts: [], nextCursor: null });

    await getCommunityMember(encodeURIComponent('أحمد'));

    expect(mockLoadCommunityMember).toHaveBeenCalledWith('أحمد');
  });

  it('answers 404 for an unknown or hidden handle', async () => {
    mockLoadCommunityMember.mockResolvedValue(null);

    const result = await getCommunityMember('missing');

    expect(result).toEqual(expect.objectContaining({ status: 404 }));
  });

  it('rejects an invalid handle without reading the loader', async () => {
    const result = await getCommunityMember('bad handle!!');

    expect(result).toEqual(expect.objectContaining({ status: 404 }));
    expect(mockLoadCommunityMember).not.toHaveBeenCalled();
  });

  it('answers 500 with the page-level sentence when the read fails', async () => {
    mockLoadCommunityMember.mockRejectedValue(new Error('db down'));

    const result = await getCommunityMember('ahmad');

    expect(result).toEqual(
      expect.objectContaining({
        status: 500,
        body: expect.objectContaining({ error: 'تعذَّر تحميل الملف.' }),
      })
    );
  });
});

describe('community comment controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOptionalUser.mockResolvedValue({ user: null, client: null });
  });

  it('passes the signed-in viewer into the block-aware thread read', async () => {
    const thread = vi.fn(async () => ({ comments: [], nextCursor: null, total: 0 }));
    mockCreatePostEngagementService.mockReturnValue({ thread });
    mockGetOptionalUser.mockResolvedValue({
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      client: null,
    });

    const result = await getPostComments('a-post', null);

    expect(result).toEqual(expect.objectContaining({ status: 200 }));
    expect(thread).toHaveBeenCalledWith('a-post', null, 20, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });

  it('reads a guest thread without a session', async () => {
    const thread = vi.fn(async () => ({ comments: [], nextCursor: null, total: 0 }));
    mockCreatePostEngagementService.mockReturnValue({ thread });

    const result = await getPostComments('a-post', null);

    expect(result).toEqual(expect.objectContaining({ status: 200 }));
    expect(thread).toHaveBeenCalledWith('a-post', null, 20, null);
  });

  it('answers 404 for a malformed comment id on edit without calling the service', async () => {
    const result = await editPostComment('not-a-uuid', { body: 'تعليق' });

    expect(result).toEqual(
      expect.objectContaining({
        status: 404,
        body: { success: false, error: 'التعليق غير موجود.' },
      })
    );
    expect(mockCreatePostEngagementService).not.toHaveBeenCalled();
  });

  it('answers 404 for a malformed comment id on delete without calling the service', async () => {
    const result = await removePostComment('not-a-uuid');

    expect(result).toEqual(
      expect.objectContaining({
        status: 404,
        body: { success: false, error: 'التعليق غير موجود.' },
      })
    );
    expect(mockCreatePostEngagementService).not.toHaveBeenCalled();
  });
});
