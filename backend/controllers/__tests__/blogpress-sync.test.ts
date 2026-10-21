import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAuthUser = vi.fn();
const mockRepository = {
  listPostsByAuthorIncludingDeleted: vi.fn(),
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
  createBlogpressPostsModule: () => ({ repository: mockRepository }),
}));

import { RepositoryError } from '@/backend/shared/repository-error';
import { syncBlogpress } from '@/backend/controllers/blogpress';

describe('blogpress sync controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUser.mockResolvedValue({
      user: { id: 'u-1', email: 'a@b.com' },
      supabase: {},
    });
    mockRepository.listPostsByAuthorIncludingDeleted.mockResolvedValue([]);
  });

  it('answers 401 without a session, like the other owned products', async () => {
    mockGetAuthUser.mockResolvedValue({ user: null, supabase: {} });

    const result = await syncBlogpress();

    expect(result).toEqual(expect.objectContaining({ status: 401, body: { error: 'غير مصرح' } }));
    expect(mockRepository.listPostsByAuthorIncludingDeleted).not.toHaveBeenCalled();
  });

  it('returns the whole owned snapshot, scoped to the session user', async () => {
    const post = { id: 'p-1', author_id: 'u-1', slug: 'p-1' };
    mockRepository.listPostsByAuthorIncludingDeleted.mockResolvedValue([post]);

    const result = await syncBlogpress();

    expect(result).toEqual(expect.objectContaining({ status: 200, body: { posts: [post] } }));
    expect(result).toMatchObject({ headers: { 'Cache-Control': 'no-store' } });
    expect(mockRepository.listPostsByAuthorIncludingDeleted).toHaveBeenCalledWith('u-1');
  });

  it('answers 500 for a data-access failure, so the pull backs off instead of advancing', async () => {
    mockRepository.listPostsByAuthorIncludingDeleted.mockRejectedValue(
      new RepositoryError('listPostsByAuthorIncludingDeleted', new Error('connection reset'))
    );

    const result = await syncBlogpress();

    expect(result).toEqual(expect.objectContaining({ status: 500 }));
  });
});
