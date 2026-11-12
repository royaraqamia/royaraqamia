import type { FollowToggleResponse } from '@/shared/contracts/follows';

/**
 * The follow routes, as the profile draws them.
 *
 * One handle in the path, one decoded body out: both clients read the same
 * `FollowToggleResponse`, so the button and the numbers above it come from the
 * server's answer rather than from what the click assumed.
 *
 * There is no read here. The starting state arrives with the page, which is
 * rendered for the viewer who asked; this module only writes.
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

export async function followMember(username: string): Promise<FollowToggleResponse> {
  const response = await fetch(handlePath(username), { method: 'POST' });
  return readBody(response);
}

export async function unfollowMember(username: string): Promise<FollowToggleResponse> {
  const response = await fetch(handlePath(username), { method: 'DELETE' });
  return readBody(response);
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
