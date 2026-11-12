import { describe, expect, it, vi } from 'vitest';
import { FollowsService, FollowRefusedError } from '@/backend/services/users/follows-service';
import type { PublicUser } from '@/shared/contracts/users';

const viewer: PublicUser = {
  id: 'viewer',
  username: 'viewer',
  name: 'المستخدم',
  avatar_url: null,
  bio: null,
  verified: true,
};

const target: PublicUser = {
  id: 'target',
  username: 'target',
  name: 'الهدف',
  avatar_url: null,
  bio: null,
  verified: true,
};

function makeService(overrides: Record<string, unknown> = {}) {
  const follows = {
    follow: vi.fn().mockResolvedValue(undefined),
    unfollow: vi.fn().mockResolvedValue(undefined),
    isFollowing: vi.fn().mockResolvedValue(false),
    counts: vi.fn().mockResolvedValue({ target: { followers: 3, following: 5 } }),
    listFollowerIds: vi.fn().mockResolvedValue({ ids: [], total: 0 }),
    listFollowingIds: vi.fn().mockResolvedValue({ ids: [], total: 0 }),
    isBlockedEitherWay: vi.fn().mockResolvedValue(false),
    ...overrides,
  };

  const users = {
    getByUsername: vi.fn(async (handle: string) => (handle === 'target' ? target : null)),
    getById: vi.fn(async () => viewer),
    getMany: vi.fn().mockResolvedValue([]),
  };

  const notify = vi.fn().mockResolvedValue(undefined);
  const checkRateLimit = vi.fn().mockResolvedValue(true);

  return {
    service: new FollowsService({
      // The repository contract is wider than this test needs; the cast keeps the
      // double honest about the methods it exercises.
      follows: follows as never,
      users: users as never,
      notify,
      checkRateLimit,
    }),
    follows,
    users,
    notify,
    checkRateLimit,
  };
}

describe('FollowsService.follow', () => {
  it('writes the edge and tells the member who was followed', async () => {
    const { service, follows, notify } = makeService();

    const result = await service.follow('viewer', 'target');

    expect(follows.follow).toHaveBeenCalledWith('viewer', 'target');
    expect(result.state).toBe('following');
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'target', type: 'new_follower' })
    );
  });

  it('answers self without writing anything', async () => {
    const { service, follows, users } = makeService();
    users.getByUsername = vi.fn(async () => viewer);

    const result = await service.follow('viewer', 'viewer');

    expect(result.state).toBe('self');
    expect(follows.follow).not.toHaveBeenCalled();
  });

  it('refuses a block in either direction, and does not write', async () => {
    const { service, follows } = makeService({
      isBlockedEitherWay: vi.fn().mockResolvedValue(true),
    });

    const result = await service.follow('viewer', 'target');

    expect(result.state).toBe('blocked');
    expect(follows.follow).not.toHaveBeenCalled();
  });

  it('treats a hidden member as absent, not as followable', async () => {
    const { service, users } = makeService();
    users.getByUsername = vi.fn(async () => ({ ...target, is_hidden: true }));

    await expect(service.follow('viewer', 'target')).rejects.toBeInstanceOf(FollowRefusedError);
  });

  it('refuses an unverified member the same way', async () => {
    const { service, users } = makeService();
    users.getByUsername = vi.fn(async () => ({ ...target, verified: false }));

    await expect(service.follow('viewer', 'target')).rejects.toBeInstanceOf(FollowRefusedError);
  });

  it('stops a caller over the write limit', async () => {
    const { service, follows, checkRateLimit } = makeService({
      isBlockedEitherWay: vi.fn().mockResolvedValue(false),
    });
    checkRateLimit.mockResolvedValue(false);

    await expect(service.follow('viewer', 'target')).rejects.toMatchObject({ status: 429 });
    expect(follows.follow).not.toHaveBeenCalled();
  });

  it('never lets a notification failure fail the follow', async () => {
    const { service, notify } = makeService();
    notify.mockRejectedValue(new Error('push is down'));

    await expect(service.follow('viewer', 'target')).resolves.toMatchObject({
      state: 'following',
    });
  });
});

describe('FollowsService.list', () => {
  it('refuses another member’s list instead of answering empty', async () => {
    const { service } = makeService();

    await expect(service.list('viewer', 'target', 'followers', 1)).rejects.toMatchObject({
      status: 403,
    });
  });
});
