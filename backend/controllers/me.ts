import { env } from '@/backend/config/env';
import { createServerUserProfileRepository } from '@/backend/config/users';
import { getOptionalUser } from '@/backend/middleware/auth-guard';
import { isAdmin } from '@/backend/shared/admin-validator';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';

/**
 * The calling user's display name and Admin status, for the header menu.
 * The Admin allowlist is never sent to the client; only this boolean is.
 *
 * `name` is read from the profile row rather than the auth token: it is the
 * value the profile editor owns, and it also covers accounts whose auth
 * metadata predates the signup name (or was never set by an OAuth provider).
 */
export async function getMe(): Promise<HttpResult> {
  const { user } = await getOptionalUser();

  let name: string | null = null;
  if (user) {
    try {
      const profile = await createServerUserProfileRepository().getById(user.id);
      name = profile?.name?.trim() ? profile.name : null;
    } catch {
      name = null;
    }
  }

  return jsonResult(
    200,
    { isAdmin: isAdmin(user?.email ?? '', env.adminEmails), name },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
