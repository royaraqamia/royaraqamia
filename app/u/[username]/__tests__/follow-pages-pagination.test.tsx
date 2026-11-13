import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadOwnFollowList: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock('@/backend/loaders/follows', () => ({
  loadOwnFollowList: (...args: unknown[]) => mocks.loadOwnFollowList(...args),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => mocks.redirect(url),
  notFound: () => mocks.notFound(),
}));

import FollowersPage from '@/app/u/[username]/followers/page';
import FollowingPage from '@/app/u/[username]/following/page';

/**
 * #1369: a page past the end used to answer 500 from the repository. The route
 * now sends the reader to the last page that exists - never an empty state over
 * a list that has rows.
 */
function visit(page: typeof FollowersPage, query: string | undefined) {
  return page({
    params: Promise.resolve({ username: 'owner' }),
    searchParams: Promise.resolve({ page: query }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Mirror Next: neither redirect nor notFound returns.
  mocks.redirect.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  });
  mocks.notFound.mockImplementation(() => {
    throw new Error('NEXT_NOT_FOUND');
  });
  mocks.loadOwnFollowList.mockResolvedValue({
    signedIn: true,
    username: 'owner',
    page: { members: [], total: 1 },
  });
});

describe('followers page pagination', () => {
  it('sends a page past the end to the last page that exists', async () => {
    await expect(visit(FollowersPage, '2')).rejects.toThrow('NEXT_REDIRECT');

    expect(mocks.loadOwnFollowList).toHaveBeenCalledWith('followers', 2);
    expect(mocks.redirect).toHaveBeenCalledWith('/u/owner/followers?page=1');
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it('clamps an absurd page to the last real page, not the empty state', async () => {
    mocks.loadOwnFollowList.mockResolvedValue({
      signedIn: true,
      username: 'owner',
      page: { members: [], total: 1800 },
    });

    await expect(visit(FollowersPage, '999')).rejects.toThrow('NEXT_REDIRECT');

    expect(mocks.redirect).toHaveBeenCalledWith('/u/owner/followers?page=60');
  });

  it('renders page 1 of an empty list without redirecting', async () => {
    mocks.loadOwnFollowList.mockResolvedValue({
      signedIn: true,
      username: 'owner',
      page: { members: [], total: 0 },
    });

    await expect(visit(FollowersPage, undefined)).resolves.toBeDefined();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each(['0', 'abc', '-3', '1.5'])('clamps ?page=%s to 1', async (raw) => {
    await visit(FollowersPage, raw);

    expect(mocks.loadOwnFollowList).toHaveBeenCalledWith('followers', 1);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe('following page pagination', () => {
  it('sends a page past the end to the last page that exists', async () => {
    await expect(visit(FollowingPage, '999')).rejects.toThrow('NEXT_REDIRECT');

    expect(mocks.loadOwnFollowList).toHaveBeenCalledWith('following', 999);
    expect(mocks.redirect).toHaveBeenCalledWith('/u/owner/following?page=1');
  });
});
