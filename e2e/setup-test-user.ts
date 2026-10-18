import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

/**
 * Bootstraps the Playwright test account: the `auth.users` row and the
 * `public.users` profile it owns.
 *
 *   node e2e/setup-test-user.ts
 *
 * Kept standalone on purpose — it imports nothing from the app and uses no path
 * aliases, so `node` runs it directly. (It used to import the app's logger
 * through `@/…`, which plain `node` cannot resolve, so the documented command
 * failed before it did anything. A bootstrap script that cannot run is worse
 * than no script: it is why the missing profile row went unnoticed.)
 *
 * Why the profile row matters: `public.users` is the table the schema points
 * its foreign keys at (`posts.author_id`, for one). A real signup writes that
 * row — but an account minted through the Admin API does not, and the app's
 * only automatic heal is the Google-OAuth branch in
 * `backend/middleware/session.ts`. Without it the account can sign in and read
 * everything, while every BlogPress create fails its foreign key with a 500,
 * which is exactly how `e2e/blogpress-offline.spec.ts` was failing — silently,
 * for as long as the suite was not run anywhere. The payload mirrors
 * `backend/repositories/users/user-profile-repository.ts#createIfAbsent`;
 * `username` is left out because a trigger fills it.
 *
 * Note: a verified `public.users` row is a member, so this account is visible
 * in the community directory. It is an ordinary confirmed account; the name
 * below is the only thing marking it as internal.
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function ensureProfile(id: string, email: string) {
  const { error } = await supabase.from('users').insert({
    id,
    email,
    name: 'E2E Test User',
    avatar_url: null,
    created_at: new Date().toISOString(),
  });

  // 23505 = unique_violation: the row is already there, and it is the
  // user-editable profile, so there is nothing to do and nothing to overwrite.
  if (error && error.code !== '23505') {
    console.error(`Failed to create the public.users row for ${email}: ${error.message}`);
    process.exit(1);
  }
}

async function ensureTestUser() {
  const email = process.env.E2E_TEST_EMAIL!;
  const password = process.env.E2E_TEST_PASSWORD!;

  // Check if user exists
  const { data: users } = await supabase.auth.admin.listUsers();
  const existing = users?.users?.find((u) => u.email === email);

  if (existing) {
    // Update password in case it changed
    await supabase.auth.admin.updateUserById(existing.id, { password });
    await ensureProfile(existing.id, email);
    console.log(`Test user already exists: ${email} (id: ${existing.id})`);
    return;
  }

  // Create the user with confirmed email
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    console.error(`Failed to create test user: ${error.message}`);
    process.exit(1);
  }

  await ensureProfile(data.user.id, email);
  console.log(`Created test user: ${email} (id: ${data.user.id})`);
}

ensureTestUser();
