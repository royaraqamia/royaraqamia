import { env } from '@/backend/config/env';
import { createServerUserProfileRepository } from '@/backend/config/users';
import { getOptionalUser } from '@/backend/middleware/auth-guard';
import { isAdmin } from '@/backend/shared/admin-validator';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';

/**
 * The calling user's display name, avatar and Admin status, for the header menu.
 * The Admin allowlist is never sent to the client; only this boolean is.
 *
 * `name` and `avatarUrl` are read from the profile row rather than the auth
 * token: they are the values the profile editor owns, and this also covers
 * accounts whose auth metadata predates the signup name (or was never set by an
 * OAuth provider).
 */
export async function getMe(): Promise<HttpResult> {
  const { user } = await getOptionalUser();

  let name: string | null = null;
  let avatarUrl: string | null = null;
  if (user) {
    try {
      const profile = await createServerUserProfileRepository().getById(user.id);
      name = profile?.name?.trim() ? profile.name : null;
      avatarUrl = profile?.avatar_url?.trim() ? profile.avatar_url : null;
    } catch {
      name = null;
      avatarUrl = null;
    }
  }

  return jsonResult(
    200,
    { isAdmin: isAdmin(user?.email ?? '', env.adminEmails), name, avatarUrl },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
