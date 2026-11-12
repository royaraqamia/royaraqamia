import type {
  FollowState,
  FollowStatesResponse,
  FollowToggleResponse,
} from '@/shared/contracts/follows';

/**
 * The follow routes, as the profile curves draw them.
 *
 * One handle in the path, one decoded body out: both clients read the same
 * `FollowToggleResponse`, so the button's state and the header's numbers come
 * from the server's answer rather than from what the click assumed.
 */

async function readBody(response: Response): Promise<FollowToggleResponse> {
  const body = (await response.json().catch(() => null)) as FollowToggleResponse | null;
  if (!body) {
    return { success: false, state: 'not_following', error: 'تعذَّر تحديث المتابعة.' };
  }
  return body;
}

function handlePath(username: string): string {
  return `/api/users/${encodeURIComponent(username)}/follow`;
}

/** The header's starting state: public counts, and the viewer's own standing. */
export async function fetchFollowState(username: string): Promise<FollowToggleResponse> {
  const response = await fetch(handlePath(username), { cache: 'no-store' });
  return readBody(response);
}

export async function followMember(username: string): Promise<FollowToggleResponse> {
  const response = await fetch(handlePath(username), { method: 'POST' });
  return readBody(response);
}

export async function unfollowMember(username: string): Promise<FollowToggleResponse> {
  const response = await fetch(handlePath(username), { method: 'DELETE' });
  return readBody(response);
}

/** The states of a list of members, in one read. */
export async function fetchFollowStates(ids: string[]): Promise<Record<string, FollowState>> {
  if (ids.length === 0) return {};

  const response = await fetch(`/api/users/follow-state?ids=${encodeURIComponent(ids.join(','))}`, {
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => null)) as FollowStatesResponse | null;
  return body?.states ?? {};
}

/**
 * Lift a block, so a blocked profile can offer the only action it has.
 *
 * The write belongs to the chat routes (`DELETE /api/chats/blocks/[userId]`),
 * because blocking is the chat's own table and this change only renamed it. It
 * is written here rather than imported from `frontend/api/chats` so the
 * community route does not pull the whole chat client into its bundle for one
 * fetch.
 */
export async function unblockMember(userId: string): Promise<void> {
  await fetch(`/api/chats/blocks/${encodeURIComponent(userId)}`, { method: 'DELETE' });
}
