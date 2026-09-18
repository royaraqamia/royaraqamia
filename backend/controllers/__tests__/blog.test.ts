import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlogPostViewRateLimitError } from '@/backend/services/blogpress/blog-view-recorder';

const mockRecordBlogPostView = vi.fn();

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/backend/config/blog', () => ({
  recordBlogPostView: (...args: unknown[]) => mockRecordBlogPostView(...args),
}));

import { recordPostView } from '@/backend/controllers/blog';

describe('blog view controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordBlogPostView.mockResolvedValue(undefined);
  });

  it('records a view for a valid slug', async () => {
    const result = await recordPostView('my-post', '1.2.3.4');

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(mockRecordBlogPostView).toHaveBeenCalledWith('my-post', '1.2.3.4');
  });

  it('returns 400 for an invalid slug', async () => {
    const result = await recordPostView('bad slug!!', '1.2.3.4');

    expect(result).toEqual(expect.objectContaining({ status: 400 }));
    expect(mockRecordBlogPostView).not.toHaveBeenCalled();
  });

  it('returns 429 when the per-IP or per-slug limit is exceeded', async () => {
    mockRecordBlogPostView.mockRejectedValue(new BlogPostViewRateLimitError());

    const result = await recordPostView('my-post', '1.2.3.4');

    expect(result).toEqual(
      expect.objectContaining({ status: 429, body: expect.objectContaining({ success: false }) })
    );
  });

  it('returns 500 when the increment fails', async () => {
    mockRecordBlogPostView.mockRejectedValue(new Error('db down'));

    const result = await recordPostView('my-post', '1.2.3.4');

    expect(result).toEqual(
      expect.objectContaining({ status: 500, body: expect.objectContaining({ success: false }) })
    );
  });
});
