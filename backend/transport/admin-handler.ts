import { identity } from '@/backend/identity/server';
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
 * Handler adapter for the Admin Console: asks the identity module for the Admin
 * outcome (which owns the session resolution, the `ADMIN_EMAILS` predicate and
 * the allowlist-mirror side effect — ADR-0003) and returns the Admin identity —
 * the same shape the session adapter returns — or a typed rejection the seam
 * maps to `401`/`403`.
 *
 * The adapter owns the default `401`/`403`/`500` bodies so an Admin controller
 * declares only what to do with the identity and how its domain errors map.
 */
export type AdminIdentity = SessionIdentity;

const UNAUTHENTICATED_BODY = { success: false, error: 'غير مصرح. يرجى تسجيل الدخول.' };
const FORBIDDEN_BODY = { success: false, error: 'غير مصرح' };
const FAILED_BODY = { success: false, error: 'حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.' };

async function resolveAdminIdentity(): Promise<AdminIdentity | AuthFailure> {
  const resolution = await identity.resolveAdmin();
  if (resolution.kind === 'anonymous') return unauthenticated();
  if (resolution.kind === 'forbidden') return forbidden();

  const { user, client } = resolution.identity;
  return {
    userId: user.id,
    userEmail: user.email ?? '',
    supabase: client as unknown as AdminIdentity['supabase'],
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
