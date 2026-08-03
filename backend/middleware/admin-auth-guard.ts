import 'server-only';

import { createClient } from '@/backend/transport/supabase/server';
import { getAdminSupabase } from '@/backend/transport/supabase/admin';
import { env } from '@/backend/config/env';

// ============================================================
// Sync the DB admin allowlist (app_settings) with ADMIN_EMAILS
// so RLS (public.is_admin()) stays consistent with the env var.
// ============================================================

async function syncAdminFlags(): Promise<void> {
  const adminEmails = env.adminEmails;
  const supabase = getAdminSupabase();

  const { data } = await supabase
    .from('app_settings')
    .select('admin_emails')
    .eq('id', true)
    .maybeSingle();

  const current = (data?.admin_emails ?? []) as string[];
  const isSame =
    current.length === adminEmails.length && adminEmails.every((e) => current.includes(e));
  if (isSame) return;

  await supabase.from('app_settings').upsert({ id: true, admin_emails: adminEmails });
  await supabase.rpc('recompute_admin_flags', { p_emails: adminEmails });
}

export async function requireAdminAuth() {
  const supabase = await createClient();
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
  await syncAdminFlags().catch(() => undefined);

  return { supabase, user };
}
