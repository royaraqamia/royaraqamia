import 'server-only';

import { unstable_cache } from 'next/cache';
import { createFollowsService } from '@/backend/config/follows';
import { identity } from '@/backend/config/identity';
import { createPublicUsersRepositoryServer } from '@/backend/config/users';
import { COMMUNITY_TAGS } from '@/backend/shared/community-cache-tags';
import type { FollowCounts, FollowListPage } from '@/shared/contracts/follows';

/**
 * The two numbers a profile header draws.
 *
 * Cached with the profile's own tag, not with the feed's: the counts are public
 * and identical for every visitor, so a profile page that is one cached document
 * can carry them. A follow or unfollow revalidates this tag from the controller,
 * which is what keeps the number current without re-rendering on every read.
 *
 * Deliberately not part of `loadCommunityMember`: that loader answers "who is
 * this member, and what did they publish", and this one answers a number about
 * other people. Keeping them apart is what lets the profile's own test stay
 * viewer-agnostic.
 */
export const loadFollowCounts = unstable_cache(
  (userId: string): Promise<FollowCounts> => createFollowsService().countsOf(userId),
  ['community-follow-counts'],
  { revalidate: 300, tags: [COMMUNITY_TAGS.memberByUsername] }
);

export interface OwnFollowList {
  /** False when the request has no session; the page sends them to sign in. */
  signedIn: boolean;
  /** The caller's own handle, so the route can refuse someone else's list. */
  username: string | null;
  page: FollowListPage | null;
}

/**
 * The caller's own follower or following list.
 *
 * Never cached and never keyed by a handle: the list is private, so the only
 * identity it is read for is the request's own. The page compares the returned
 * handle with the one in the URL and answers not-found for anyone else's - which
 * is why no `?handle=` parameter exists to be tampered with.
 */
export async function loadOwnFollowList(
  kind: 'followers' | 'following',
  page: number
): Promise<OwnFollowList> {
  const { user } = await identity.resolveSession();
  if (!user) return { signedIn: false, username: null, page: null };

  const [viewer, list] = await Promise.all([
    createPublicUsersRepositoryServer().getById(user.id),
    createFollowsService().list(user.id, user.id, kind, page),
  ]);

  return { signedIn: true, username: viewer?.username ?? null, page: list };
}
