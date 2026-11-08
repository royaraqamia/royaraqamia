import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetByUsername = vi.fn();
const mockFeed = vi.fn();

/*
 * The loader's rule is what this file pins: a hidden member never leaves
 * `loadCommunityMember` (ADR-0127), so the cached profile page cannot decide
 * anything per viewer. `unstable_cache` is the tag store, not the rule, so it is
 * the identity here.
 */
vi.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => fn,
}));

vi.mock('@/backend/config/supabase', () => ({
  getPublicSupabase: () => ({}),
}));

vi.mock('@/backend/config/blogpress', () => ({
  createBlogpressPostsModule: () => ({
    repository: {
      getPublishedFeed: (...args: unknown[]) => mockFeed(...args),
      getFeaturedPublishedByAuthor: async () => null,
    },
  }),
  createBlogpressAdminPostsModule: () => ({
    repository: { getPostAuthor: async () => null },
  }),
}));

vi.mock('@/backend/config/users', () => ({
  createPublicUsersRepositoryServer: () => ({
    getByUsername: (...args: unknown[]) => mockGetByUsername(...args),
  }),
}));

import { loadCommunityMember } from '@/backend/loaders/community';
import type { MemberProfile } from '@/shared/contracts/users';

const member: MemberProfile = {
  id: 'u-1',
  username: 'ahmad',
  name: 'أحمد',
  avatar_url: null,
  bio: null,
  verified: true,
  is_hidden: false,
};

describe('loadCommunityMember', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFeed.mockResolvedValue({ posts: [], nextCursor: null });
  });

  it('answers a listed member with their first page of posts', async () => {
    mockGetByUsername.mockResolvedValue(member);

    await expect(loadCommunityMember('ahmad')).resolves.toMatchObject({
      member: { id: 'u-1' },
      posts: [],
    });
  });

  it('answers nothing for a hidden member, so the cached page is a 404', async () => {
    mockGetByUsername.mockResolvedValue({ ...member, is_hidden: true });

    await expect(loadCommunityMember('ahmad')).resolves.toBeNull();
    expect(mockFeed).not.toHaveBeenCalled();
  });

  it('answers nothing for an unconfirmed member, as before', async () => {
    mockGetByUsername.mockResolvedValue({ ...member, verified: false });

    await expect(loadCommunityMember('ahmad')).resolves.toBeNull();
  });

  it('answers nothing for a handle no row matches', async () => {
    mockGetByUsername.mockResolvedValue(null);

    await expect(loadCommunityMember('nobody')).resolves.toBeNull();
  });
});
