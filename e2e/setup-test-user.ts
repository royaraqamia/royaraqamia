import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

/**
 * Bootstraps the Playwright test account: the `auth.users` row, the
 * `public.users` profile it owns, and the plan the suite runs on.
 *
 *   node e2e/setup-test-user.ts            # create/refresh the account, on Pro
 *   node e2e/setup-test-user.ts --reset    # also purge what earlier runs left
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
 * Why the plan matters (ADR-0075): every create is gated by a standing
 * owned-item cap — 5 habits, 10 short links, 5 drafts on free — and the suite
 * writes those items as its fixture. It also shares one account across runs, so
 * anything a failed spec cannot clean up accumulates. Once the account held more
 * than a free cap, every creating spec was answered 402 `owned_item_cap` before
 * it could even run its cleanup, which is a deadlock: a permanent red check with
 * nothing wrong in the product. A Pro row gives the account the headroom to be
 * used as a fixture (200 habits, 1000 links) without the suite having to care
 * about quotas. `--reset` is the escape hatch for an account that is already
 * poisoned; it is deliberately not part of the default run, because two offline
 * jobs for different branches run at the same time against this one account and
 * a purge would delete rows a live run is still asserting on.
 *
 * Note: a verified `public.users` row is a member, so this account is visible
 * in the community directory. It is an ordinary confirmed account; the name
 * below is the only thing marking it as internal.
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** How long a bootstrap's Pro grant lasts; refreshed on every run. */
const PRO_DAYS = 3650;

/**
 * The account's own product rows, children first, so a purge does not trip a
 * foreign key. These are the tables the offline suite writes — and the ones the
 * owned-item caps count.
 */
const OWNED_ITEMS: ReadonlyArray<{ table: string; owner: string }> = [
  { table: 'habit_logs', owner: 'user_id' },
  { table: 'habits', owner: 'user_id' },
  { table: 'recurring_expenses', owner: 'user_id' },
  { table: 'expenses', owner: 'user_id' },
  { table: 'budgets', owner: 'user_id' },
  { table: 'categories', owner: 'user_id' },
  { table: 'short_links', owner: 'user_id' },
  { table: 'quran_reading_positions', owner: 'user_id' },
  { table: 'quran_bookmarks', owner: 'user_id' },
  { table: 'posts', owner: 'author_id' },
  { table: 'community_tags', owner: 'user_id' },
  { table: 'community_categories', owner: 'user_id' },
];

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

/**
 * Put the account on Pro, extended from today on every run.
 *
 * A row is written directly rather than through `activate_plan`: that RPC
 * records an operator purchase (`plan_activations`, an `activated_by`), and this
 * is test scaffolding, not a sale.
 */
async function ensurePlan(userId: string) {
  const expiresAt = new Date(Date.now() + PRO_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('user_plans')
    .upsert(
      { user_id: userId, plan: 'pro', expires_at: expiresAt, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );

  if (error) {
    console.error(`Failed to put the test account on Pro: ${error.message} (${error.code})`);
    process.exit(1);
  }

  // Read the plan back through the same RPC the cap check uses, so a stale or
  // expired row cannot pass unnoticed.
  const state = await supabase.rpc('get_usage_state', { p_user_id: userId });
  if (state.error) {
    console.error(`Failed to read the test account's plan: ${state.error.message}`);
    process.exit(1);
  }
  const plan = (state.data as { plan?: string } | null)?.plan ?? 'unknown';
  console.log(`Test account is on plan: ${plan} (expires ${expiresAt})`);
  if (plan !== 'pro') {
    console.error('Expected the test account to resolve as Pro; the owned-item caps still apply.');
    process.exit(1);
  }
}

/** Delete the account's product rows, so a run starts from an empty account. */
async function resetOwnedItems(userId: string) {
  let failed = 0;
  for (const { table, owner } of OWNED_ITEMS) {
    const { error, count } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .eq(owner, userId);

    if (error) {
      failed += 1;
      console.error(`Could not purge ${table}: ${error.message} (${error.code})`);
      continue;
    }
    if (count) console.log(`Purged ${count} row(s) from ${table}`);
  }

  if (failed > 0) {
    console.error(`${failed} table(s) could not be purged; clean the account by hand.`);
    process.exit(1);
  }
  console.log('Account reset: no owned rows left.');
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
    await ensurePlan(existing.id);
    if (process.argv.includes('--reset')) await resetOwnedItems(existing.id);
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
  await ensurePlan(data.user.id);
  console.log(`Created test user: ${email} (id: ${data.user.id})`);
}

ensureTestUser();
