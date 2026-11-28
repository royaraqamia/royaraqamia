import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockListMembers = vi.fn();
const mockPublishedAuthorIds = vi.fn();

/*
 * The roster's rule is what this file pins (#1952): while the product has fewer
 * than three authors, the page does not ask a reader to follow someone who has
 * never published. `unstable_cache` is the tag store, not the rule, so it is the
 * identity here.
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
      getPublishedAuthorIds: (...args: unknown[]) => mockPublishedAuthorIds(...args),
    },
  }),
}));

vi.mock('@/backend/config/users', () => ({
  createPublicUsersRepositoryServer: () => ({
    list: (...args: unknown[]) => mockListMembers(...args),
  }),
}));

import { loadCommunityMembers } from '@/backend/loaders/community';
import type { PublicUser } from '@/shared/contracts/users';

function member(id: string, username: string): PublicUser {
  return { id, username, name: username, avatar_url: null, bio: null, verified: true };
}

// Two authors and one account that has never published: the fixture the issue
// asks the filter to be asserted against.
const authors = [member('u-1', 'ahmad'), member('u-2', 'reem')];
const nonAuthor = member('u-3', 'new-member');
const roster = [...authors, nonAuthor];

describe('loadCommunityMembers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListMembers.mockResolvedValue(roster);
  });

  it('keeps only the accounts that have published, below three authors', async () => {
    mockPublishedAuthorIds.mockResolvedValue(['u-1', 'u-2']);

    await expect(loadCommunityMembers()).resolves.toEqual(authors);
  });

  it('draws no roster at all when nobody has published', async () => {
    mockPublishedAuthorIds.mockResolvedValue([]);

    await expect(loadCommunityMembers()).resolves.toEqual([]);
  });

  it('returns the whole directory once three members have published', async () => {
    mockPublishedAuthorIds.mockResolvedValue(['u-1', 'u-2', 'u-4']);

    await expect(loadCommunityMembers()).resolves.toEqual(roster);
  });
});
