import type { PublicUser } from '@/shared/contracts/users';

/**
 * What the session already knows about the viewer: enough to draw their own
 * row without a second read. `/api/me` is the page's session provider's own
 * source, so the pinned row cannot show a name or an avatar its profile page
 * would not (#946, ADR-0098).
 */
export interface ViewerMember {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface PinnedRoster {
  members: PublicUser[];
  /** The viewer's row, or `null` when nobody is signed in. */
  selfId: string | null;
}

/**
 * The viewer's own row first, then the roster in its own order.
 *
 * The roster is a shared, cached read (`loadCommunityMembers`) — it is the same
 * fifty rows for every visitor and cannot know who is asking — so the pin is a
 * browser decision taken from the session, never a server one. That also makes
 * it total: the viewer's row is pinned whether or not it falls inside the
 * roster's cap, because the session already carries it.
 *
 * One row, not two: a member already listed moves up rather than being drawn
 * twice, and the rest keep the newest-first order the repository returned.
 */
export function withPinnedSelf(members: PublicUser[], viewer: ViewerMember | null): PinnedRoster {
  if (!viewer) return { members, selfId: null };

  const listed = members.find((member) => member.id === viewer.id) ?? null;
  const rest = members.filter((member) => member.id !== viewer.id);
  const self: PublicUser = listed ?? {
    id: viewer.id,
    username: viewer.username,
    name: viewer.name,
    avatar_url: viewer.avatarUrl,
    bio: null,
    // The roster's own listing flag, not a claim about the row: every signed-in
    // member is email-confirmed, so their profile route resolves.
    verified: true,
  };

  return { members: [self, ...rest], selfId: viewer.id };
}
