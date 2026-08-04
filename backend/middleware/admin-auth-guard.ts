import 'server-only';

import { createServerSupabaseClient, getAdminSupabase } from '@/backend/config/supabase';
import { createAdminAllowlistRepository } from '@/backend/repositories/admin/admin-allowlist-repository';
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
  const adminEmails = env.adminEmails;
  const userEmail = user.email?.toLowerCase() ?? '';

  if (adminEmails.length === 0 || !adminEmails.includes(userEmail)) {
    throw new Error('FORBIDDEN');
  }

  // Keep the DB admin allowlist (used by RLS) in sync with ADMIN_EMAILS.
  await createAdminAllowlistRepository(getAdminSupabase())
    .sync(env.adminEmails)
    .catch(() => undefined);

  return { supabase, user };
}
