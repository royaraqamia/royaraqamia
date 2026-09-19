import { getAdminSupabase } from '@/backend/config/supabase';
import { createAdminAllowlistRepository } from '@/backend/repositories/admin/admin-allowlist-repository';
import { AdminAllowlistService } from '@/backend/services/users/admin-allowlist-service';

export function createAdminAllowlistService(): AdminAllowlistService {
  return new AdminAllowlistService(createAdminAllowlistRepository(getAdminSupabase()));
}

/**
 * Best-effort rewrite of the database Admin allowlist mirror from `ADMIN_EMAILS`,
 * used on the request auth path. `ADMIN_EMAILS` is the authority and the mirror is
 * derived (ADR-0003), so a sync failure must not fail the request that triggered it.
 */
export function syncAdminAllowlistMirror(emails: string[]): Promise<void> {
  return createAdminAllowlistRepository(getAdminSupabase())
    .sync(emails)
    .catch(() => undefined);
}
