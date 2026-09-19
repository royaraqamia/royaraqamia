import 'server-only';

import { createServerSupabaseClient } from '@/backend/config/supabase';
import { syncAdminAllowlistMirror } from '@/backend/config/admin-allowlist';
import { isAdmin } from '@/backend/shared/admin-validator';
import { env } from '@/backend/config/env';

export async function requireAdminAuth() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('UNAUTHORIZED');
  }

  // RBAC: check if user email is in the admin list (fail closed)
  if (!isAdmin(user.email ?? '', env.adminEmails)) {
    throw new Error('FORBIDDEN');
  }

  // Keep the DB admin allowlist (used by RLS) in sync with ADMIN_EMAILS.
  await syncAdminAllowlistMirror(env.adminEmails);

  return { supabase, user };
}
