import { describe, expect, it, vi } from 'vitest';
import { FollowsService } from '@/backend/services/users/follows-service';
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
    // The write path's one call: `follow_edge` resolves, judges, writes and
    // counts, so the double answers for all four at once (#1374).
    followEdge: vi.fn().mockResolvedValue({
      outcome: 'ok',
      targetId: 'target',
      wrote: true,
      counts: { followers: 3, following: 5 },
      viewer: { name: 'المستخدم', username: 'viewer' },
    }),
    isFollowing: vi.fn().mockResolvedValue(false),
    counts: vi.fn().mockResolvedValue({ target: { followers: 3, following: 5 } }),
    listFollowerIds: vi.fn().mockResolvedValue({ ids: [], total: 0 }),
    listFollowingIds: vi.fn().mockResolvedValue({ ids: [], total: 0 }),
    followingAmong: vi.fn().mockResolvedValue([]),
    blockedAmong: vi.fn().mockResolvedValue({ blockedByViewer: [], blockedViewer: [] }),
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

    const result = await service.follow('viewer', 'Target');

    expect(follows.followEdge).toHaveBeenCalledWith('viewer', 'Target', true);
    expect(result).toEqual({ state: 'following', counts: { followers: 3, following: 5 } });
    expect(notify).toHaveBeenCalledWith({
      user_id: 'target',
      type: 'new_follower',
      title: 'متابِع جديد',
      body: 'المستخدم بدأ متابعتك.',
      metadata: { username: 'viewer', name: 'المستخدم' },
    });
  });

  // #1374: the whole write is one call plus the budget. Six sequential reads is
  // what made a press take ~1.7 s, so this pins the shape, not just the answer.
  it('answers the write in one call, without the reads it replaced', async () => {
    const { service, follows, users, checkRateLimit } = makeService();

    await service.follow('viewer', 'target');

    expect(follows.followEdge).toHaveBeenCalledTimes(1);
    expect(checkRateLimit).toHaveBeenCalledTimes(1);
    expect(users.getByUsername).not.toHaveBeenCalled();
    expect(users.getById).not.toHaveBeenCalled();
    expect(follows.isBlockedEitherWay).not.toHaveBeenCalled();
    expect(follows.counts).not.toHaveBeenCalled();
  });

  // #1371: a repeat follow is the same edge, and the recipient has already been
  // told. Seven notifications for one edge is what this pins down.
  it('stays silent when the edge was already there', async () => {
    const { service, follows, notify } = makeService({
      followEdge: vi.fn().mockResolvedValue({
        outcome: 'ok',
        targetId: 'target',
        wrote: false,
        counts: { followers: 3, following: 5 },
        viewer: null,
      }),
    });

    const result = await service.follow('viewer', 'target');

    expect(result.state).toBe('following');
    expect(follows.followEdge).toHaveBeenCalledWith('viewer', 'target', true);
    expect(notify).not.toHaveBeenCalled();
  });

  // Two requests for the same pair: the database writes one edge and hands the
  // row to one caller, so exactly one «بدأ متابعتك» goes out.
  it('tells the member once when two follows of the pair race', async () => {
    const followEdge = vi
      .fn()
      .mockResolvedValueOnce({
        outcome: 'ok',
        targetId: 'target',
        wrote: true,
        counts: { followers: 3, following: 5 },
        viewer: { name: 'المستخدم', username: 'viewer' },
      })
      .mockResolvedValueOnce({
        outcome: 'ok',
        targetId: 'target',
        wrote: false,
        counts: { followers: 3, following: 5 },
        viewer: null,
      });
    const { service, notify } = makeService({ followEdge });

    const [first, second] = await Promise.all([
      service.follow('viewer', 'target'),
      service.follow('viewer', 'target'),
    ]);

    expect(first.state).toBe('following');
    expect(second.state).toBe('following');
    expect(followEdge).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('answers self without telling anyone', async () => {
    const { service, follows, notify } = makeService({
      followEdge: vi.fn().mockResolvedValue({
        outcome: 'self',
        targetId: 'viewer',
        wrote: false,
        counts: { followers: 3, following: 5 },
        viewer: null,
      }),
    });

    const result = await service.follow('viewer', 'viewer');

    expect(result.state).toBe('self');
    expect(follows.followEdge).toHaveBeenCalledWith('viewer', 'viewer', true);
    expect(notify).not.toHaveBeenCalled();
  });

  it('answers a block in either direction, and tells nobody', async () => {
    const { service, notify } = makeService({
      followEdge: vi.fn().mockResolvedValue({
        outcome: 'blocked',
        targetId: 'target',
        wrote: false,
        counts: { followers: 3, following: 5 },
        viewer: null,
      }),
    });

    const result = await service.follow('viewer', 'target');

    expect(result).toEqual({ state: 'blocked', counts: { followers: 3, following: 5 } });
    expect(notify).not.toHaveBeenCalled();
  });

  // Hidden, unconfirmed and absent all answer the same 404, so the write cannot
  // be used to find a row the directory skips.
  it('refuses a handle the directory would not name', async () => {
    const { service } = makeService({
      followEdge: vi.fn().mockResolvedValue({ outcome: 'not_found' }),
    });

    await expect(service.follow('viewer', 'ghost')).rejects.toMatchObject({ status: 404 });
  });

  it('stops a caller over the write limit', async () => {
    const { service, follows, checkRateLimit } = makeService();
    checkRateLimit.mockResolvedValue(false);

    await expect(service.follow('viewer', 'target')).rejects.toMatchObject({ status: 429 });
    expect(follows.followEdge).not.toHaveBeenCalled();
  });

  it('never lets a notification failure fail the follow', async () => {
    const { service, notify } = makeService();
    notify.mockRejectedValue(new Error('push is down'));

    await expect(service.follow('viewer', 'target')).resolves.toMatchObject({
      state: 'following',
    });
  });
});

describe('FollowsService.unfollow', () => {
  it('removes the edge in the same one call, and tells nobody', async () => {
    const { service, follows, notify } = makeService({
      followEdge: vi.fn().mockResolvedValue({
        outcome: 'ok',
        targetId: 'target',
        wrote: false,
        counts: { followers: 2, following: 5 },
        viewer: null,
      }),
    });

    const result = await service.unfollow('viewer', 'target');

    expect(follows.followEdge).toHaveBeenCalledWith('viewer', 'target', false);
    expect(result).toEqual({ state: 'not_following', counts: { followers: 2, following: 5 } });
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('FollowsService.list', () => {
  it('refuses another member’s list instead of answering empty', async () => {
    const { service } = makeService();

    await expect(service.list('viewer', 'target', 'followers', 1)).rejects.toMatchObject({
      status: 403,
    });
  });

  // #1372: the followers page paid one `isFollowing` read per row - thirty round
  // trips for a page of thirty - while a single `followingAmong` answers the
  // same question. This pins the read count, not just the flags.
  it('answers a full page of followers in one follow read', async () => {
    const ids = Array.from({ length: 30 }, (_, index) => `member-${index}`);
    const members: PublicUser[] = ids.map((id) => ({
      id,
      username: id,
      name: null,
      avatar_url: null,
      bio: null,
      verified: true,
    }));
    const { service, follows, users } = makeService({
      listFollowerIds: vi.fn().mockResolvedValue({ ids, total: ids.length }),
      followingAmong: vi.fn().mockResolvedValue(['member-7']),
    });
    users.getMany = vi.fn().mockResolvedValue(members);

    const page = await service.list('viewer', 'viewer', 'followers', 1);

    expect(follows.followingAmong).toHaveBeenCalledTimes(1);
    expect(follows.followingAmong).toHaveBeenCalledWith('viewer', ids);
    expect(follows.isFollowing).not.toHaveBeenCalled();
    expect(page.members).toHaveLength(30);
    expect(page.members.filter((member) => member.following)).toEqual([
      expect.objectContaining({ id: 'member-7', following: true }),
    ]);
  });

  it('marks every row of the following list without reading the edges twice', async () => {
    const members: PublicUser[] = [
      { id: 'a', username: 'a', name: null, avatar_url: null, bio: null, verified: true },
      { id: 'b', username: 'b', name: null, avatar_url: null, bio: null, verified: true },
    ];
    const { service, follows, users } = makeService({
      listFollowingIds: vi.fn().mockResolvedValue({ ids: ['a', 'b'], total: 2 }),
    });
    users.getMany = vi.fn().mockResolvedValue(members);

    const page = await service.list('viewer', 'viewer', 'following', 1);

    // The list is the edge: every row is, by definition, followed.
    expect(page.members.every((member) => member.following)).toBe(true);
    expect(follows.followingAmong).not.toHaveBeenCalled();
    expect(follows.isFollowing).not.toHaveBeenCalled();
  });
});
