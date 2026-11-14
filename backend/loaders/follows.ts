import 'server-only';

import { createFollowsService } from '@/backend/config/follows';
import { identity } from '@/backend/config/identity';
import { createPublicUsersRepositoryServer } from '@/backend/config/users';
import type { FollowListPage } from '@/shared/contracts/follows';

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
 *
 * The counts a profile draws are not here on purpose: the profile page reads
 * them with the viewer's standing in one call
 * (`createFollowsService().viewerState`), so a profile render never depends on
 * this loader.
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
