import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommunityPostViewRateLimitError } from '@/backend/services/blogpress/community-view-recorder';

const mockRecordCommunityPostView = vi.fn();
const mockLoadCommunityPost = vi.fn();

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/backend/config/community', () => ({
  recordCommunityPostView: (...args: unknown[]) => mockRecordCommunityPostView(...args),
}));

vi.mock('@/backend/loaders/community', () => ({
  loadCommunityPost: (...args: unknown[]) => mockLoadCommunityPost(...args),
  loadAccountPosts: vi.fn(),
}));

import { getCommunityPost, recordPostView } from '@/backend/controllers/community';

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
