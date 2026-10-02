import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommunityPostViewRateLimitError } from '@/backend/services/blogpress/community-view-recorder';

const mockRecordCommunityPostView = vi.fn();

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/backend/config/community', () => ({
  recordCommunityPostView: (...args: unknown[]) => mockRecordCommunityPostView(...args),
}));

import { recordPostView } from '@/backend/controllers/community';

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
