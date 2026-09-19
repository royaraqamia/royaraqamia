import { env } from '@/backend/config/env';
import { getAuthUser } from '@/backend/middleware/auth-guard';
import { syncAdminAllowlistMirror } from '@/backend/config/admin-allowlist';
import { isAdmin } from '@/backend/shared/admin-validator';
import {
  forbidden,
  handleAuthenticated,
  unauthenticated,
  type AuthFailure,
  type HandlerPolicy,
  type SessionIdentity,
} from '@/backend/transport/authenticated-handler';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';

/**
 * Handler adapter for the Admin Console: resolves the session cookie, applies the
 * `ADMIN_EMAILS` allowlist predicate (ADR-0003) and returns the Admin identity —
 * the same shape the session adapter returns — or a typed rejection the seam maps
 * to `401`/`403`.
 *
 * The adapter owns the default `401`/`403`/`500` bodies so an Admin controller
 * declares only what to do with the identity and how its domain errors map.
 */
export type AdminIdentity = SessionIdentity;

const UNAUTHENTICATED_BODY = { success: false, error: 'غير مصرح. يرجى تسجيل الدخول.' };
const FORBIDDEN_BODY = { success: false, error: 'غير مصرح' };
const FAILED_BODY = { success: false, error: 'حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.' };

async function resolveAdminIdentity(): Promise<AdminIdentity | AuthFailure> {
  const { user, supabase } = await getAuthUser();
  if (!user) return unauthenticated();
  if (!isAdmin(user.email ?? '', env.adminEmails)) return forbidden();

  // Keep the DB admin allowlist (used by RLS) in sync with ADMIN_EMAILS.
  await syncAdminAllowlistMirror(env.adminEmails);

  return {
    userId: user.id,
    userEmail: user.email ?? '',
    supabase: supabase as unknown as AdminIdentity['supabase'],
  };
}

export function withAdminUser(
  run: (identity: AdminIdentity) => Promise<HttpResult>,
  policy: HandlerPolicy = {}
): Promise<HttpResult> {
  return handleAuthenticated(resolveAdminIdentity, run, {
    whenUnauthenticated:
      policy.whenUnauthenticated ?? (() => jsonResult(401, UNAUTHENTICATED_BODY)),
    whenForbidden: policy.whenForbidden ?? (() => jsonResult(403, FORBIDDEN_BODY)),
    whenFailed: policy.whenFailed ?? FAILED_BODY,
    mapError: policy.mapError,
  });
}
