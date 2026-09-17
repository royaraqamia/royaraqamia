import { env } from '@/backend/config/env';
import { getOptionalUser } from '@/backend/middleware/auth-guard';
import { isAdmin } from '@/backend/shared/admin-validator';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';

/**
 * Whether the calling user is an Admin, for painting the Admin Console entry.
 * The Admin allowlist is never sent to the client; only this boolean is.
 */
export async function getMyAdminStatus(): Promise<HttpResult> {
  const { user } = await getOptionalUser();

  return jsonResult(
    200,
    { isAdmin: isAdmin(user?.email ?? '', env.adminEmails) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
