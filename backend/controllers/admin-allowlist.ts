import { timingSafeEqual } from 'node:crypto';
import { env } from '@/backend/config/env';
import { createAdminAllowlistService } from '@/backend/config/admin-allowlist';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';

/**
 * The caller may supply the service role key. It is already how the scheduled workflow
 * reaches the database, so reusing it here adds no credential to rotate and keeps the
 * allowlist itself in exactly one place - the app's own ADMIN_EMAILS.
 */
function hasValidSyncToken(authorization: string | null): boolean {
  const expected = env.supabaseServiceRoleKey;
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
