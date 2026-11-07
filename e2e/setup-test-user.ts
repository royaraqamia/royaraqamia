import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

/**
 * Bootstraps the Playwright test account: the `auth.users` row, the
 * `public.users` profile it owns, the plan the suite runs on, and the chats
 * fixture the offline spec reads.
 *
 *   node e2e/setup-test-user.ts                      # create/refresh the account, on Pro
 *   node e2e/setup-test-user.ts --purge-stale=90     # also drop fixtures older than 90 minutes
 *   node e2e/setup-test-user.ts --reset              # also purge everything the account owns
 *
 * The chats fixture is a second, hidden account and one direct thread between
 * it and the test account, with one line from the peer: `e2e/chats-offline.spec.ts`
 * needs a conversation it owns, and the shared account otherwise holds none, so
 * the spec skipped on every run.
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
 * owned-item cap — 5 habits, 5 short links, 5 drafts on free, and 50 of each on
 * Pro since the caps were lowered (`plan_limits`, 2026-10-29) — and the suite
 * writes those items as its fixture. It also shares one account across runs, so
 * anything a failed spec cannot clean up accumulates. Once the account held more
 * than a cap, every creating spec was answered 402 `owned_item_cap` before it
 * could even run its cleanup, which is a deadlock: a permanent red check with
 * nothing wrong in the product. A Pro row gives the account more headroom, but
 * not unlimited: fifty links and fifty habits is a handful of runs, so
 * `--purge-stale` is what the offline job runs on every start — it drops rows
 * older than the job's own timeout, which can only be a dead run's leftovers,
 * never a run happening at the same time on another branch. `--reset` purges
 * everything and is the escape hatch for an account that is already poisoned; it
 * is deliberately not what the job runs, because two offline jobs can run at
 * once against this one account.
 *
 * Note: a verified `public.users` row is a member, so this account would be
 * listed in the community directory, the member search and the sitemap.
 * `hideProfile` sets the `is_hidden` flag (ADR-0127) on every run, so it is an
 * ordinary confirmed account the suite signs in as, and a row no public surface
 * names.
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** How long a bootstrap's Pro grant lasts; refreshed on every run. */
const PRO_DAYS = 3650;

/**
 * The other side of the chats fixture. A second confirmed account, hidden from
 * every public listing like the test account itself, that the suite never signs
 * in as: it exists so `chats-offline.spec.ts` has a conversation it owns.
 */
const PEER_EMAIL = 'e2e-peer@royaraqamia.test';
const PEER_NAME = 'E2E Peer';

/** The one line the peer leaves in the fixture thread, so the thread has a bubble. */
const FIXTURE_BODY = 'رسالة اختبار';

/** The pair key the participants trigger writes, sorted the same way it sorts. */
function directKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

/** A short wait, used only to let a concurrent run finish writing the same pair. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The account's own product rows, children first, so a purge does not trip a
 * foreign key. These are the tables the offline suite writes — and the ones the
 * owned-item caps count.
 */
const OWNED_ITEMS: ReadonlyArray<{ table: string; owner: string; at?: string }> = [
  // A habit log is dated by the day it records, not by when the row was written.
  { table: 'habit_logs', owner: 'user_id', at: 'date' },
  { table: 'habits', owner: 'user_id' },
  { table: 'recurring_expenses', owner: 'user_id' },
  { table: 'expenses', owner: 'user_id' },
  { table: 'budgets', owner: 'user_id' },
  { table: 'categories', owner: 'user_id' },
  { table: 'notes', owner: 'user_id' },
  { table: 'short_links', owner: 'user_id' },
  { table: 'quran_reading_positions', owner: 'user_id' },
  { table: 'quran_bookmarks', owner: 'user_id' },
  { table: 'posts', owner: 'author_id' },
  { table: 'community_tags', owner: 'user_id' },
  { table: 'community_categories', owner: 'user_id' },
];

async function ensureProfile(id: string, email: string, name = 'E2E Test User') {
  const { error } = await supabase.from('users').insert({
    id,
    email,
    name,
    avatar_url: null,
    created_at: new Date().toISOString(),
  });

  // 23505 = unique_violation: the row is already there, and it is the
  // user-editable profile, so there is nothing to do and nothing to overwrite.
  if (error && error.code !== '23505') {
    console.error(`Failed to create the public.users row for ${email}: ${error.message}`);
    process.exit(1);
  }

  await hideProfile(id);
}

/**
 * Keep the account out of every public listing (ADR-0127).
 *
 * The row is a real, confirmed member, so without this flag the roster, the
 * member search, the sitemap and the chat picker name it. It is set on every
 * run, so the flag survives a re-provisioned account. On a branch whose
 * migration is not applied yet the column does not exist; that is a warning
 * rather than a failure, because the merge applies the migration and a
 * bootstrap that cannot run is worse than no bootstrap (the same rule
 * `isMissingFunction` follows).
 */
async function hideProfile(id: string) {
  const { error } = await supabase.from('users').update({ is_hidden: true }).eq('id', id);
  if (!error) return;

  if (isMissingColumn(error)) {
    console.warn(
      `users.is_hidden is not in this project yet (${error.message}); the merge applies the migration.`
    );
    return;
  }

  console.error(`Failed to hide the test account's profile row: ${error.message} (${error.code})`);
  process.exit(1);
}

/**
 * A function the migration in this branch adds is not in the linked project
 * until that migration is applied, and `migration-drift` only applies after a
 * merge. A pull request therefore runs against a project that does not have it
 * yet, so a bootstrap that refused there would be red for the whole branch over
 * something the merge resolves — the same "a script that cannot run is worse
 * than no script" this file already learned once.
 */
function isMissingFunction(error: { code?: string; message: string }): boolean {
  return (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    error.message.includes('Could not find the function')
  );
}

/** The same branch-project rule for a column the merge adds. */
function isMissingColumn(error: { code?: string; message: string }): boolean {
  return (
    error.code === 'PGRST204' ||
    error.code === '42703' ||
    error.message.includes("'is_hidden' column")
  );
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
  // expired row cannot pass unnoticed. Where the function is not in the project
  // yet, read the row itself rather than fail: the merge applies the migration.
  const state = await supabase.rpc('get_usage_counters', { p_user_id: userId });
  let plan: string;

  if (state.error && !isMissingFunction(state.error)) {
    console.error(`Failed to read the test account's plan: ${state.error.message}`);
    process.exit(1);
  }

  if (state.error) {
    const row = await supabase
      .from('user_plans')
      .select('plan')
      .eq('user_id', userId)
      .maybeSingle();
    if (row.error) {
      console.error(`Failed to read the test account's plan row: ${row.error.message}`);
      process.exit(1);
    }
    plan = (row.data as { plan?: string } | null)?.plan ?? 'unknown';
    console.warn(
      `get_usage_counters is not in this project yet (${state.error.message}); ` +
        `read user_plans instead: ${plan}`
    );
  } else {
    plan = (state.data as { plan?: string } | null)?.plan ?? 'unknown';
  }

  console.log(`Test account is on plan: ${plan} (expires ${expiresAt})`);
  if (plan !== 'pro') {
    console.error('Expected the test account to resolve as Pro; the owned-item caps still apply.');
    process.exit(1);
  }
}

/**
 * Delete the account's product rows, so a run starts from an empty account.
 *
 * `olderThanMinutes` bounds it to what no live run can still be asserting on: a
 * job's whole lifetime is its 40-minute timeout, so anything older is a dead
 * run's leftovers. Without it, everything the account owns goes.
 */
async function resetOwnedItems(userId: string, olderThanMinutes?: number) {
  const cutoff =
    olderThanMinutes === undefined
      ? null
      : new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();
  let failed = 0;

  for (const { table, owner, at = 'created_at' } of OWNED_ITEMS) {
    let query = supabase.from(table).delete({ count: 'exact' }).eq(owner, userId);
    if (cutoff) query = query.lt(at, cutoff);
    const { error, count } = await query;

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
  console.log(
    cutoff
      ? `Account reset: nothing older than ${cutoff} left.`
      : 'Account reset: no owned rows left.'
  );
}

/** `--purge-stale` with no value uses this, comfortably past the job's 40 minutes. */
const STALE_MINUTES_DEFAULT = 90;

/** The `--purge-stale[=<minutes>]` flag, or `null` when it was not passed. */
function staleMinutes(): number | null {
  const flag = process.argv.find((arg) => arg.startsWith('--purge-stale'));
  if (!flag) return null;

  const value = flag.includes('=') ? Number(flag.split('=')[1]) : STALE_MINUTES_DEFAULT;
  if (!Number.isFinite(value) || value < 0) {
    console.error(`--purge-stale takes a number of minutes, got: ${flag}`);
    process.exit(1);
  }
  return value;
}

/** An auth user by email, paging past the admin API's default page size. */
async function findAuthUserByEmail(email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error(`Could not list the auth users: ${error.message}`);
      process.exit(1);
    }
    const found = data.users.find((user) => user.email === email);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** The fixture's other member: confirmed, hidden, never signed in as. */
async function ensurePeer(): Promise<string> {
  const existing = await findAuthUserByEmail(PEER_EMAIL);
  if (existing) {
    await ensureProfile(existing.id, PEER_EMAIL, PEER_NAME);
    return existing.id;
  }

  // The password is never used: the suite does not sign in as the peer. It
  // still satisfies the project's character-class rule, or the Admin API refuses
  // the account.
  const generatedPassword = `${randomUUID()}Aa1!`;

  const { data, error } = await supabase.auth.admin.createUser({
    email: PEER_EMAIL,
    password: generatedPassword,
    email_confirm: true,
    user_metadata: { name: PEER_NAME },
  });

  if (error || !data.user) {
    console.error(`Failed to create the chats peer: ${error?.message ?? 'no user returned'}`);
    process.exit(1);
  }

  await ensureProfile(data.user.id, PEER_EMAIL, PEER_NAME);
  console.log(`Created the chats peer: ${PEER_EMAIL} (id: ${data.user.id})`);
  return data.user.id;
}

/**
 * Drops the direct thread between the two accounts, and any conversation a
 * crashed run left before its participants were written.
 *
 * The fixture is recreated right after, so the spec always reads a thread with
 * one line and an active peer rather than whatever an earlier run left.
 */
async function purgeChatFixture(
  userId: string,
  peerId: string,
  options: { reset: boolean; staleMinutes: number | null }
) {
  if (!options.reset && options.staleMinutes === null) return;

  const cutoff = options.reset ? 0 : Date.now() - (options.staleMinutes ?? 0) * 60_000;
  const candidates = new Map<string, string>();

  const byKey = await supabase
    .from('chat_conversations')
    .select('id, created_at')
    .eq('direct_key', directKey(userId, peerId));
  if (byKey.error) {
    console.error(`Could not read the chats fixture: ${byKey.error.message}`);
    process.exit(1);
  }
  for (const row of byKey.data ?? []) candidates.set(row.id, row.created_at);

  const incomplete = await supabase
    .from('chat_conversations')
    .select('id, created_at')
    .eq('created_by', userId)
    .eq('kind', 'direct')
    .is('direct_key', null);
  if (incomplete.error) {
    console.error(`Could not read unfinished chats fixtures: ${incomplete.error.message}`);
    process.exit(1);
  }
  for (const row of incomplete.data ?? []) candidates.set(row.id, row.created_at);

  let purged = 0;
  for (const [id, createdAt] of candidates) {
    if (Date.parse(createdAt) > cutoff) continue;
    const { error } = await supabase.from('chat_conversations').delete().eq('id', id);
    if (error) {
      console.error(`Could not purge the chats fixture ${id}: ${error.message}`);
      process.exit(1);
    }
    purged += 1;
  }
  if (purged > 0) console.log(`Purged ${purged} chats fixture row(s).`);
}

/**
 * The direct thread `chats-offline.spec.ts` reads: both sides active, one line
 * from the peer. Created once and reused while it is fresh; a participant write
 * that loses the unique direct key is answered by the other run's thread.
 */
async function ensureChatFixture(userId: string, peerId: string): Promise<string> {
  const key = directKey(userId, peerId);

  const find = async (): Promise<string | null> => {
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('id')
      .eq('direct_key', key)
      .maybeSingle();
    if (error) {
      console.error(`Could not read the chats fixture: ${error.message}`);
      process.exit(1);
    }
    return data?.id ?? null;
  };

  const participantRows = (conversationId: string) => [
    {
      conversation_id: conversationId,
      user_id: userId,
      role: 'owner',
      status: 'active',
    },
    {
      conversation_id: conversationId,
      user_id: peerId,
      role: 'member',
      status: 'active',
    },
  ];

  /** A new row is stamped once; a state guard forbids moving it afterwards. */
  const withJoinedAt = (rows: ReturnType<typeof participantRows>) =>
    rows.map((row) => ({ ...row, joined_at: new Date().toISOString() }));

  let conversationId = await find();

  if (!conversationId) {
    const created = await supabase
      .from('chat_conversations')
      .insert({ kind: 'direct', created_by: userId })
      .select('id')
      .single();
    if (created.error || !created.data) {
      console.error(`Failed to create the chats fixture: ${created.error?.message ?? 'no row'}`);
      process.exit(1);
    }
    const createdId = created.data.id as string;

    const joined = await supabase
      .from('chat_participants')
      .insert(withJoinedAt(participantRows(createdId)));
    if (joined.error) {
      // The other side of the unique direct key won the race: drop ours and
      // read the thread it wrote instead.
      await supabase.from('chat_conversations').delete().eq('id', createdId);
      for (let attempt = 0; attempt < 10 && !conversationId; attempt += 1) {
        await sleep(500);
        conversationId = await find();
      }
      if (!conversationId) {
        console.error(`Failed to join the chats fixture: ${joined.error.message}`);
        process.exit(1);
      }
    } else {
      conversationId = createdId;
    }
  }

  if (!conversationId) {
    console.error('The chats fixture did not resolve to a conversation.');
    process.exit(1);
  }

  // A dead run can leave the request pending, or one row missing. Fill what is
  // absent (stamped once), then answer the request on what is already there.
  const present = await supabase
    .from('chat_participants')
    .select('user_id')
    .eq('conversation_id', conversationId);
  if (present.error) {
    console.error(`Could not read the chats fixture's roster: ${present.error.message}`);
    process.exit(1);
  }

  const presentIds = new Set((present.data ?? []).map((row) => row.user_id as string));
  const rows = participantRows(conversationId);
  const missing = rows.filter((row) => !presentIds.has(row.user_id));
  if (missing.length > 0) {
    const filled = await supabase.from('chat_participants').insert(withJoinedAt(missing));
    if (filled.error) {
      console.error(
        `Failed to complete the chats fixture ${conversationId}: ${filled.error.message}`
      );
      process.exit(1);
    }
  }

  const existing = rows.filter((row) => presentIds.has(row.user_id));
  if (existing.length > 0) {
    const reopened = await supabase
      .from('chat_participants')
      .upsert(existing, { onConflict: 'conversation_id,user_id' });
    if (reopened.error) {
      console.error(
        `Failed to reopen the chats fixture ${conversationId}: ${reopened.error.message}`
      );
      process.exit(1);
    }
  }

  const line = await supabase
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .is('deleted_at', null);
  if (line.error) {
    console.error(`Could not read the chats fixture's lines: ${line.error.message}`);
    process.exit(1);
  }

  if ((line.count ?? 0) === 0) {
    const written = await supabase.from('chat_messages').insert({
      conversation_id: conversationId,
      sender_id: peerId,
      sender_kind: 'user',
      body: FIXTURE_BODY,
    });
    if (written.error) {
      console.error(`Failed to write the chats fixture's line: ${written.error.message}`);
      process.exit(1);
    }
  }

  console.log(`Chats fixture: ${conversationId} (peer ${PEER_EMAIL})`);
  return conversationId;
}

async function ensureTestUser(): Promise<string> {
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
    else {
      const stale = staleMinutes();
      if (stale !== null) await resetOwnedItems(existing.id, stale);
    }
    console.log(`Test user already exists: ${email} (id: ${existing.id})`);
    return existing.id;
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
  return data.user.id;
}

async function main() {
  const userId = await ensureTestUser();
  const peerId = await ensurePeer();
  const reset = process.argv.includes('--reset');
  const stale = reset ? null : staleMinutes();
  await purgeChatFixture(userId, peerId, { reset, staleMinutes: stale });
  await ensureChatFixture(userId, peerId);
}

void main();
