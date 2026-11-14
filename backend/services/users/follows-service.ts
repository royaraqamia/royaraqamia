import type { FollowsRepository } from '@/backend/repositories/users/follows-repository';
import type { PublicUsersRepository } from '@/backend/repositories/users/public-users-repository';
import type { NotificationProducer } from '@/backend/config/notifications';
import {
  FOLLOW_LIST_PAGE_SIZE,
  FOLLOW_WRITE_LIMIT,
  FOLLOW_WRITE_WINDOW_MS,
  type FollowCounts,
  type FollowListEntry,
  type FollowListPage,
  type FollowState,
} from '@/shared/contracts/follows';

/** A refusal the caller must be told about, with the status it means. */
export class FollowRefusedError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'FollowRefusedError';
  }
}

export interface FollowsServiceDeps {
  follows: FollowsRepository;
  users: PublicUsersRepository;
  /** Fail-safe: a notification never blocks the follow that caused it. */
  notify: NotificationProducer;
  checkRateLimit: (key: string, limit: number, windowMs: number) => Promise<boolean>;
}

export interface FollowResult {
  state: FollowState;
  counts: FollowCounts;
}

/**
 * Following, unfollowing, and the two lists.
 *
 * The rules that live here rather than in a policy, because they need reads a
 * policy cannot make:
 *
 * - a member cannot follow themselves, and the viewer's own profile says `self`
 *   instead of offering a button;
 * - only a member the directory would name can be followed (verified, not
 *   hidden), so a follow cannot surface a row the roster, the search and the
 *   sitemap all skip;
 * - a block in either direction forbids the edge, and blocking already severs
 *   existing edges in the database trigger, so this check is about the write;
 * - a script gets thirty writes a minute; a member never meets it.
 *
 * The lists are private: the only member whose follower or following list this
 * service answers is the caller asking for their own.
 */
export class FollowsService {
  constructor(private readonly deps: FollowsServiceDeps) {}

  async follow(viewerId: string, rawUsername: string): Promise<FollowResult> {
    const target = await this.resolveTarget(rawUsername);

    if (target.id === viewerId) {
      return {
        state: 'self',
        counts: await this.countsOf(viewerId),
      };
    }

    if (await this.deps.follows.isBlockedEitherWay(viewerId, target.id)) {
      return { state: 'blocked', counts: await this.countsOf(target.id) };
    }

    await this.assertUnderWriteLimit(viewerId);

    const wroteEdge = await this.deps.follows.follow(viewerId, target.id);

    // Only the call that wrote the row tells the member. Following someone who
    // is already followed is the same edge in the graph, and the recipient has
    // read «بدأ متابعتك» for it already - a second one is noise, not news.
    if (wroteEdge) {
      // After the write, and never awaited as a condition: a member's feed must
      // not fail because a push did.
      const viewer = await this.deps.users.getById(viewerId);
      void this.deps.notify({
        user_id: target.id,
        type: 'new_follower',
        title: 'متابِع جديد',
        body: `${viewer?.name?.trim() || `@${viewer?.username ?? ''}`} بدأ متابعتك.`,
        metadata: { username: viewer?.username ?? null, name: viewer?.name ?? null },
      });
    }

    return { state: 'following', counts: await this.countsOf(target.id) };
  }

  async unfollow(viewerId: string, rawUsername: string): Promise<FollowResult> {
    const target = await this.resolveTarget(rawUsername);

    if (target.id === viewerId) {
      return { state: 'self', counts: await this.countsOf(viewerId) };
    }

    await this.assertUnderWriteLimit(viewerId);
    await this.deps.follows.unfollow(viewerId, target.id);

    // No notification: nobody is told they lost a follower. That is the one
    // deliberate silence in this surface.
    return { state: 'not_following', counts: await this.countsOf(target.id) };
  }

  async countsOf(userId: string): Promise<FollowCounts> {
    const counts = await this.deps.follows.counts([userId]);
    return counts[userId] ?? { followers: 0, following: 0 };
  }

  /**
   * The viewer's standing with one member, and that member's numbers.
   *
   * Three reads, in parallel and in one round trip: the aggregate, the block in
   * either direction, and the edge. The page already has the member row, so this
   * takes its id - looking the handle up again would be a fourth read to learn
   * something the caller already knows.
   */
  async viewerState(
    viewerId: string | null,
    memberId: string
  ): Promise<{ state: FollowState; counts: FollowCounts }> {
    if (!viewerId || viewerId === memberId) {
      return {
        state: viewerId ? 'self' : 'not_following',
        counts: await this.countsOf(memberId),
      };
    }

    const [counts, blocked, following] = await Promise.all([
      this.countsOf(memberId),
      this.deps.follows.isBlockedEitherWay(viewerId, memberId),
      this.deps.follows.isFollowing(viewerId, memberId),
    ]);

    return {
      state: blocked ? 'blocked' : following ? 'following' : 'not_following',
      counts,
    };
  }

  /**
   * The viewer's standing with one member, addressed by the handle.
   *
   * The page already holds the member row it read, so `viewerState` takes its
   * id. A client with no server render to draw from has only the handle in
   * view, and resolving it here keeps the "who may be named" rule in one place
   * rather than making every client repeat it.
   */
  async standingOf(viewerId: string, rawUsername: string): Promise<FollowResult> {
    const target = await this.resolveTarget(rawUsername);
    return this.viewerState(viewerId, target.id);
  }

  /**
   * Every viewer/state pair a list of members needs, in two reads.
   *
   * These rows are drawn as controls, so a read per row would make the roster
   * rail cost more than the feed beside it. `self` wins over `blocked`, and a
   * block in either direction wins over a follow that the trigger has already
   * severed - the states are ordered, not merged.
   */
  async statesFor(viewerId: string, ids: string[]): Promise<Record<string, FollowState>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return {};

    const [following, blocks] = await Promise.all([
      this.deps.follows.followingAmong(viewerId, unique),
      this.deps.follows.blockedAmong(viewerId, unique),
    ]);

    const followingSet = new Set(following);
    const blockedSet = new Set([...blocks.blockedByViewer, ...blocks.blockedViewer]);

    const states: Record<string, FollowState> = {};
    for (const id of unique) {
      states[id] =
        id === viewerId
          ? 'self'
          : blockedSet.has(id)
            ? 'blocked'
            : followingSet.has(id)
              ? 'following'
              : 'not_following';
    }
    return states;
  }

  /**
   * The caller's own follower or following list.
   *
   * `ownerId` is the member who owns the list, and it is compared, not trusted:
   * a member asking for someone else's list is refused rather than answered
   * empty, because "not yours" and "empty" are different facts.
   */
  async list(
    viewerId: string,
    ownerId: string,
    kind: 'followers' | 'following',
    page: number
  ): Promise<FollowListPage> {
    if (ownerId !== viewerId) {
      throw new FollowRefusedError(403, 'قائمة المتابعة خاصة بصاحب الحساب.');
    }

    const { ids, total } =
      kind === 'followers'
        ? await this.deps.follows.listFollowerIds(ownerId, page, FOLLOW_LIST_PAGE_SIZE)
        : await this.deps.follows.listFollowingIds(ownerId, page, FOLLOW_LIST_PAGE_SIZE);

    const members = await this.deps.users.getMany(ids);
    const order = new Map(ids.map((id, index) => [id, index]));
    // The directory read is unordered; the list's own order is the follow
    // order, and `getMany` also drops any id whose row is gone.
    const hydrated = [...members].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    // One read for the whole page. A follower row draws its follow control, so
    // the flag is needed, but asking `isFollowing` per row spent a round trip
    // per member - thirty for a full page (#1372). The following list is the
    // edge itself, so its rows are followed without a second read.
    const followingSet = new Set(
      kind === 'following' ? ids : await this.deps.follows.followingAmong(ownerId, ids)
    );

    const entries: FollowListEntry[] = hydrated.map((member) => ({
      ...member,
      following: followingSet.has(member.id),
    }));

    return { members: entries, total };
  }

  private async resolveTarget(rawUsername: string) {
    const target = await this.deps.users.getByUsername(rawUsername.toLowerCase());

    // "Not a member the directory lists" answers the same 404 as "no such
    // handle": a hidden or unconfirmed row must not be distinguishable from an
    // absent one here, or this route becomes the way to find them.
    if (!target || !target.verified || target.is_hidden) {
      throw new FollowRefusedError(404, 'هذا العضو غير موجود.');
    }

    return target;
  }

  private async assertUnderWriteLimit(viewerId: string): Promise<void> {
    const allowed = await this.deps.checkRateLimit(
      `follow:${viewerId}`,
      FOLLOW_WRITE_LIMIT,
      FOLLOW_WRITE_WINDOW_MS
    );
    if (!allowed) {
      throw new FollowRefusedError(429, 'محاولات كثيرة في وقت قصير. أعد المحاولة بعد دقيقة.');
    }
  }
}
