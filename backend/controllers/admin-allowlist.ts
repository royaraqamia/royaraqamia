import { timingSafeEqual } from 'node:crypto';
import { env } from '@/backend/config/env';
import { createAdminAllowlistService } from '@/backend/config/admin-allowlist';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';

/**
 * The scheduled workflow carries its own `ADMIN_SYNC_SECRET`, not the Supabase
 * service-role key. The database key is the master credential and has no reason
 * to travel to this endpoint; keeping the two separate means either one can be
 * rotated without breaking the other. The allowlist itself stays in exactly one
 * place - the app's own ADMIN_EMAILS.
 */
function hasValidSyncToken(authorization: string | null): boolean {
  const expected = env.adminSyncSecret;
  if (!expected || !authorization) return false;

  const provided = authorization.replace(/^Bearer\s+/i, '').trim();
  const providedBytes = Buffer.from(provided, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');

  return (
    providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes)
  );
}

export async function syncAdminAllowlist(input: {
  authorization: string | null;
  dryRun: boolean;
}): Promise<HttpResult> {
  if (!hasValidSyncToken(input.authorization)) {
    return jsonResult(401, { error: 'unauthorized' });
  }

  const result = await createAdminAllowlistService().sync(env.adminEmails, {
    dryRun: input.dryRun,
  });

  return jsonResult(200, result);
}
