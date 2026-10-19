#!/usr/bin/env node
/**
 * Checks that the owned tables this app subscribes to for sync hints are really
 * published to Realtime (ADR-0060), and that a change reaches the account it
 * belongs to.
 *
 * The publication is a per-environment setting — a migration in this repo, and a
 * dashboard toggle everywhere else — so a project can serve the whole app with
 * the hints silently dead: the surfaces still pull on mount and focus, and the
 * only symptom is cross-device latency. This is the check that says which it is.
 *
 * One table per product is enough. What the migration turns on is
 * `postgres_changes` for a table plus the RLS and filter that decide *whose*
 * changes arrive, and neither is table-specific: `habits` proves HabitFlow's
 * entry, `expenses` SpendTrack's, `short_links` LinkSnap's and
 * `quran_bookmarks` the Quran Reader's. The rows it writes are its own and it
 * deletes them again.
 *
 *   node --env-file=.env scripts/check-realtime-hints.mjs
 *
 * Needs `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`), the publishable key, the
 * service-role key, and the Playwright test account
 * (`e2e/setup-test-user.ts`). Without them it reports what is missing and skips,
 * so a workflow can run it unconditionally.
 */

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const REALTIME_TIMEOUT_MS = 20_000;
const POLL_MS = 200;

/** The tables whose subscription is the product's whole hint tier. */
const PROBES = [
  {
    product: 'HabitFlow',
    table: 'habits',
    idColumn: 'id',
    row: () => ({ name: `realtime hint check ${Date.now()}`, frequency: 'daily' }),
  },
  {
    product: 'SpendTrack',
    table: 'expenses',
    idColumn: 'id',
    row: async (service, userId) => {
      // A seeded default category belongs to nobody and is shared, so it is a
      // legal reference from this account's expense.
      const { data, error } = await service
        .from('categories')
        .select('id')
        .eq('is_default', true)
        .limit(1)
        .maybeSingle();
      if (error || !data) throw new Error(`no default category to reference: ${error?.message}`);
      return {
        amount: 1,
        date: new Date().toISOString().slice(0, 10),
        description: `realtime hint check ${Date.now()}`,
        category_id: data.id,
      };
    },
  },
  {
    product: 'LinkSnap',
    table: 'short_links',
    // `code` is the primary key here, not `id`.
    idColumn: 'code',
    row: () => ({
      // `code` is varchar(16) and unique.
      code: `hint${Date.now().toString(36)}`,
      original_url: 'https://example.com/realtime-hint-check',
    }),
  },
  {
    product: 'Quran Reader',
    table: 'quran_bookmarks',
    idColumn: 'id',
    // A mark on Ayat al-Kursi; the row is deleted again below. The reader's other
    // table is published by the same migration and the same guard, so one probe
    // stands for both.
    row: () => ({ surah: 2, ayah: 255 }),
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(POLL_MS);
  }
  return predicate();
}

/** A ready env, or the list of variables this check cannot run without. */
function readConfig(env = process.env) {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const values = {
    url,
    publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    email: env.E2E_TEST_EMAIL,
    password: env.E2E_TEST_PASSWORD,
  };
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  return { values, missing };
}

/** A session token for the test account: Realtime authorizes with one. */
async function signIn({ url, publishableKey, email, password }) {
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
    },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json();
  if (!body.access_token) {
    throw new Error(`sign-in failed (${response.status}): ${JSON.stringify(body).slice(0, 200)}`);
  }
  return {
    token: body.access_token,
    userId: JSON.parse(Buffer.from(body.access_token.split('.')[1], 'base64url').toString()).sub,
  };
}

/** Subscribes, writes a row the way the server would, and reports what arrived. */
async function probe(config, { url, publishableKey, serviceKey }, userId, token) {
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const subscriber = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  subscriber.realtime.setAuth(token);

  const events = [];
  let status = 'connecting';
  const channel = subscriber
    .channel(`check_${config.table}_hints`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: config.table, filter: `user_id=eq.${userId}` },
      (payload) => events.push(payload)
    )
    .subscribe((next) => {
      status = next;
    });

  const subscribed = await waitFor(() => status === 'SUBSCRIBED', REALTIME_TIMEOUT_MS);

  const id = randomUUID();
  const row = await config.row(service, userId);
  const key = config.idColumn === 'code' ? row.code : id;
  const inserted = subscribed
    ? await service
        .from(config.table)
        .insert(
          config.idColumn === 'id' ? { id, user_id: userId, ...row } : { user_id: userId, ...row }
        )
        .select(config.idColumn)
    : null;

  const arrived =
    inserted && !inserted.error
      ? await waitFor(() => events.length > 0, REALTIME_TIMEOUT_MS)
      : false;

  try {
    if (inserted && !inserted.error) {
      await service.from(config.table).delete().eq(config.idColumn, key);
    }
  } finally {
    await subscriber.removeChannel(channel);
    await subscriber.realtime.disconnect();
  }

  if (!subscribed) {
    return {
      product: config.product,
      table: config.table,
      ok: false,
      reason: `channel never subscribed (${status})`,
    };
  }
  if (inserted?.error) {
    return {
      product: config.product,
      table: config.table,
      ok: false,
      reason: `could not write: ${inserted.error.message}`,
    };
  }
  return {
    product: config.product,
    table: config.table,
    ok: arrived,
    reason: arrived
      ? `hint arrived (${events[0].eventType})`
      : 'no change arrived: the table is not in the supabase_realtime publication',
  };
}

export async function main({ env = process.env, log = console.log } = {}) {
  const { values, missing } = readConfig(env);
  if (missing.length > 0) {
    log(`Not configured (${missing.join(', ')}), so there is nothing to check. Skipping.`);
    return 0;
  }

  const session = await signIn(values);
  log(`Checking Realtime hints as ${values.email} (${session.userId}).`);

  const results = [];
  for (const config of PROBES) {
    // One table that cannot be probed must not hide the others: a failure here
    // is a finding about that table, not an abort.
    let result;
    try {
      result = await probe(config, values, session.userId, session.token);
    } catch (error) {
      result = { product: config.product, table: config.table, ok: false, reason: error.message };
    }
    results.push(result);
    log(
      `  ${result.ok ? '✓' : '✗'} ${result.product.padEnd(10)} ${result.table.padEnd(12)} ${result.reason}`
    );
  }

  const failed = results.filter((result) => !result.ok);
  if (failed.length === 0) {
    log('');
    log('Every subscribed table delivered a change for its own account.');
    return 0;
  }

  log('');
  log('Some subscribed tables delivered nothing. The tables are published by');
  log(
    'supabase/migrations/*_publish_owned_tables_for_realtime_hints.sql, which applies on merge to main;'
  );
  log('on a project built any other way, add them with:');
  log('  alter publication supabase_realtime add table public.<table>;');
  return 1;
}

const invokedDirectly =
  process.argv[1] !== undefined && process.argv[1].endsWith('check-realtime-hints.mjs');

if (invokedDirectly) {
  process.exitCode = await main();
}
