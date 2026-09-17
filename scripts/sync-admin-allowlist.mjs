#!/usr/bin/env node
/**
 * Sync the database Admin allowlist from ADMIN_EMAILS.
 *
 * `public.is_admin()` reads `public.app_settings.admin_emails`, and the only in-app
 * writer of that value is a successful `requireAdminAuth()` call
 * (backend/middleware/admin-auth-guard.ts). So a revocation only reaches the database
 * once an Admin loads /admin, and removing the last Admin never reaches it at all,
 * because no one can pass the guard to trigger the sync. Running this after a deploy,
 * or on a schedule, makes that convergence deterministic.
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL   project URL
 *   SUPABASE_SERVICE_ROLE_KEY  service role key (server-only)
 *   ADMIN_EMAILS               comma-separated allowlist
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RAW_EMAILS = process.env.ADMIN_EMAILS ?? '';

function fail(message) {
  console.error(`[sync-admin-allowlist] ${message}`);
  process.exit(1);
}

async function main() {
  if (!SUPABASE_URL) fail('missing NEXT_PUBLIC_SUPABASE_URL');
  if (!SERVICE_ROLE_KEY) fail('missing SUPABASE_SERVICE_ROLE_KEY');

  // Mirrors backend/shared/admin-validator.parseAdminEmails, so the database copy is
  // written exactly the way the database compares against it.
  const emails = RAW_EMAILS.split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  // An empty list is a legitimate fail-closed state, but reaching it here almost always
  // means the variable is missing rather than deliberately cleared, and applying it
  // would revoke every Admin at the database level. Refuse loudly instead.
  if (emails.length === 0) {
    fail('ADMIN_EMAILS is empty; refusing to clear the allowlist on a possible misconfiguration');
  }

  const headers = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  const upsert = await fetch(`${SUPABASE_URL}/rest/v1/app_settings?on_conflict=id`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ id: true, admin_emails: emails }]),
  });

  if (!upsert.ok) {
    fail(`app_settings upsert failed: ${upsert.status} ${await upsert.text()}`);
  }

  const recompute = await fetch(`${SUPABASE_URL}/rest/v1/rpc/recompute_admin_flags`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_emails: emails }),
  });

  if (!recompute.ok) {
    fail(`recompute_admin_flags failed: ${recompute.status} ${await recompute.text()}`);
  }

  // Never log the addresses themselves.
  console.log(
    `[sync-admin-allowlist] allowlist synced: ${emails.length} ${
      emails.length === 1 ? 'entry' : 'entries'
    }`
  );
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
