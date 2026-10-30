#!/usr/bin/env node
/**
 * Exercises the private-source path against the real project (ADR-0106).
 *
 * Unit tests never touch Postgres, and the parts of this feature that can go
 * wrong live there: two `security definer` RPCs, a quota trigger that has to
 * tell "new slot" from "same feed again", partial indexes, and three RLS
 * policies. This script signs up two disposable accounts through the real API —
 * so RLS answers for a real session — and asserts what each one may see and do.
 *
 *   node scripts/news/smoke-private-sources.mjs
 *   node --env-file .env scripts/news/smoke-private-sources.mjs   # against the deployment
 *
 * It creates its own users, and deletes them at the end (their news rows cascade
 * with them), so the only trace on success is the log. It is `workflow_dispatch`
 * only, never part of CI: it writes to the deployment.
 *
 * Exit codes: 0 when every check passed (or the environment is incomplete, which
 * is a skip), 1 when an assertion failed. The failing check is named.
 */

const PROJECT_URL = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
  .trim()
  .replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

const TIMEOUT_MS = 20_000;
const random = () => Math.random().toString(36).slice(2, 10);

function headers(token, extra = {}) {
  return {
    apikey: token === SERVICE_KEY ? SERVICE_KEY : ANON_KEY,
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    ...extra,
  };
}

async function call(path, { method = 'GET', token = SERVICE_KEY, body, prefer } = {}) {
  const extra = prefer ? { prefer } : {};
  const response = await fetch(`${PROJECT_URL}${path}`, {
    method,
    headers: headers(token, extra),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = await response.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  return { status: response.status, ok: response.ok, body: parsed };
}

/** A disposable account, confirmed so no mail is sent. */
async function createUser(label) {
  const email = `news-smoke-${label}-${random()}@example.invalid`;
  // GoTrue refuses anything without all four character classes.
  const password = `Sm-${random()}${random()}A9!`;

  const created = await call('/auth/v1/admin/users', {
    method: 'POST',
    body: { email, password, email_confirm: true },
  });
  if (!created.ok) {
    throw new Error(
      `creating ${label} failed: HTTP ${created.status} ${JSON.stringify(created.body)}`
    );
  }

  const signedIn = await call('/auth/v1/token?grant_type=password', {
    method: 'POST',
    token: ANON_KEY,
    body: { email, password },
  });
  if (!signedIn.ok) {
    throw new Error(`signing ${label} in failed: HTTP ${signedIn.status}`);
  }

  return {
    id: created.body.id,
    email,
    token: signedIn.body.access_token,
  };
}

async function submit(user, name, url) {
  return call('/rest/v1/news_source_requests?select=id,status', {
    method: 'POST',
    token: user.token,
    body: { user_id: user.id, url, name, status: 'resolving' },
    prefer: 'return=representation',
  });
}

async function accept(requestId, url, kind = 'feed') {
  return call('/rest/v1/rpc/accept_news_private_source', {
    method: 'POST',
    body: { p_request_id: requestId, p_kind: kind, p_resolved_url: url },
  });
}

/**
 * The worker's own write: a row an Admin may decide is `ready`, not `resolving`.
 * The smoke uses it so the approval RPCs are exercised with a real resolved row.
 */
async function markReady(requestId, url) {
  return call(`/rest/v1/news_source_requests?id=eq.${requestId}`, {
    method: 'PATCH',
    body: { status: 'ready', kind: 'feed', resolved_url: url },
  });
}

async function checklist() {
  const results = [];
  const check = (name, condition, detail = '') => {
    results.push({ name, ok: Boolean(condition), detail });
    console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${condition ? '' : ` — ${detail}`}`);
  };
  return { results, check };
}

async function main() {
  if (!PROJECT_URL || !SERVICE_KEY || !ANON_KEY) {
    console.log('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and the publishable key are required.');
    console.log('Skipping: this script writes to the deployment, so it never guesses credentials.');
    return;
  }

  console.log(`Smoke-testing private sources against ${PROJECT_URL}`);

  const users = [];
  const sourceIds = [];
  const catalogueIds = [];

  try {
    const reader = await createUser('a');
    users.push(reader);
    const other = await createUser('b');
    users.push(other);
    console.log(`  two disposable readers: ${reader.id}, ${other.id}`);

    const { results, check } = await checklist();
    const suffix = random();
    const feed = `https://example.com/news-smoke-${suffix}/rss`;
    const secondFeed = `https://example.com/news-smoke-${suffix}/second.xml`;

    // ---- a reader files its own requests (RLS insert policy) ----
    const filed = await submit(reader, 'مصدر تجريبي', feed);
    check(
      'a reader may file a resolving request',
      filed.ok && filed.body?.[0]?.status === 'resolving',
      JSON.stringify(filed.body)
    );

    const duplicate = await submit(reader, 'مصدر تجريبي', feed);
    check(
      'the same reader cannot file the same URL twice',
      duplicate.status === 409,
      `HTTP ${duplicate.status}`
    );

    const otherFiled = await submit(other, 'مصدر تجريبي', feed);
    check('another reader may file the same URL', otherFiled.ok, `HTTP ${otherFiled.status}`);

    // ---- the worker's accept RPC ----
    const accepted = await accept(filed.body[0].id, feed);
    check(
      'accepting a resolved request approves it and writes the private source',
      accepted.ok &&
        accepted.body?.[0]?.status === 'approved' &&
        accepted.body?.[0]?.user_source_id,
      JSON.stringify(accepted.body)
    );
    if (accepted.ok) sourceIds.push(accepted.body[0].user_source_id);

    // ---- the plan cap: Free is 1 ----
    const secondFiled = await submit(reader, 'مصدر ثانٍ', secondFeed);
    const overCap = await accept(secondFiled.body[0].id, secondFeed);
    check(
      'a second private source is refused at the Free cap (PL001)',
      overCap.status === 400 && overCap.body?.code === 'PL001',
      JSON.stringify(overCap.body)
    );

    // ---- re-adding the feed a reader already holds is an update, not a slot ----
    const again = await submit(reader, 'مصدر تجريبي', feed);
    const reAccepted = again.ok ? await accept(again.body[0].id, feed) : { ok: false };
    check(
      're-accepting a held feed succeeds at the cap',
      reAccepted.ok,
      JSON.stringify(reAccepted.body ?? {})
    );

    // ---- RLS: own read, nobody else's ----
    const mine = await call('/rest/v1/news_user_sources?select=id,url', { token: reader.token });
    check(
      'a reader reads exactly their own source',
      mine.ok && mine.body?.length === 1,
      JSON.stringify(mine.body)
    );

    const theirs = await call('/rest/v1/news_user_sources?select=id', { token: other.token });
    check(
      'another reader sees none of it',
      theirs.ok && theirs.body?.length === 0,
      JSON.stringify(theirs.body)
    );

    const stolen = await call(`/rest/v1/news_user_sources?id=eq.${sourceIds[0] ?? 'none'}`, {
      method: 'DELETE',
      token: other.token,
      prefer: 'return=representation',
    });
    check(
      'another reader cannot delete it',
      stolen.status === 204 || stolen.body?.length === 0,
      `HTTP ${stolen.status}`
    );

    // ---- the Admin's two destinations ----
    const forCatalogue = await submit(
      other,
      'مصدر للقائمة',
      `https://example.com/news-smoke-${suffix}/catalogue.xml`
    );
    await markReady(
      forCatalogue.body[0].id,
      `https://example.com/news-smoke-${suffix}/catalogue.xml`
    );
    const catalogue = await call('/rest/v1/rpc/approve_news_source_request', {
      method: 'POST',
      body: {
        p_request_id: forCatalogue.body[0].id,
        p_source_id: `smoke-news-${suffix}`,
        p_source_name: 'مصدر للقائمة',
        p_source_url: `https://example.com/news-smoke-${suffix}/catalogue.xml`,
        p_category: 'world',
        p_region: 'world',
        p_tier: 2,
        p_note: null,
        p_reviewed_by: other.id,
        p_kind: 'feed',
        p_destination: 'catalogue',
      },
    });
    check(
      'the catalogue destination approves into news_sources',
      catalogue.ok,
      JSON.stringify(catalogue.body)
    );
    if (catalogue.ok) catalogueIds.push(`smoke-news-${suffix}`);

    const publicRead = await call(`/rest/v1/news_sources?select=id&id=eq.smoke-news-${suffix}`, {
      token: ANON_KEY,
    });
    check(
      'the new catalogue source is publicly readable',
      publicRead.ok && publicRead.body?.length === 1,
      JSON.stringify(publicRead.body)
    );

    // ---- the private destination: the same decision, into the reader's list ----
    const forPrivate = await submit(
      other,
      'مصدر خاصّ',
      `https://example.com/news-smoke-${suffix}/private.xml`
    );
    await markReady(forPrivate.body[0].id, `https://example.com/news-smoke-${suffix}/private.xml`);
    const privateApprove = await call('/rest/v1/rpc/approve_news_source_request', {
      method: 'POST',
      body: {
        p_request_id: forPrivate.body[0].id,
        p_source_id: `smoke-private-${suffix}`,
        p_source_name: 'مصدر خاصّ',
        p_source_url: `https://example.com/news-smoke-${suffix}/private.xml`,
        p_category: 'world',
        p_region: 'world',
        p_tier: 2,
        p_note: null,
        p_reviewed_by: other.id,
        p_kind: 'feed',
        p_destination: 'private',
      },
    });
    check(
      'the private destination writes the reader’s own source, not the catalogue',
      privateApprove.ok &&
        Boolean(privateApprove.body?.[0]?.user_source_id) &&
        !privateApprove.body?.[0]?.source_id,
      JSON.stringify(privateApprove.body)
    );
    if (privateApprove.ok) sourceIds.push(privateApprove.body[0].user_source_id);

    // ---- the reader may remove their own source ----
    const removed = await call(`/rest/v1/news_user_sources?id=eq.${sourceIds[0] ?? 'none'}`, {
      method: 'DELETE',
      token: reader.token,
      prefer: 'return=representation',
    });
    check(
      'a reader deletes their own source',
      removed.status === 204 || removed.body?.length === 1,
      `HTTP ${removed.status}`
    );

    const failures = results.filter((result) => !result.ok);
    console.log(`\n${results.length - failures.length}/${results.length} checks passed.`);
    if (failures.length > 0) process.exitCode = 1;
  } finally {
    // The users own every row this script wrote; deleting them is the cleanup,
    // and it is unconditional so a failed assertion does not leave the project
    // with two test accounts.
    for (const id of catalogueIds) {
      await call(`/rest/v1/news_sources?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }).catch(() => undefined);
    }
    for (const user of users) {
      const deleted = await call(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE' }).catch(
        () => null
      );
      if (!deleted?.ok)
        console.error(`  could not delete ${user.email} (${user.id}) — remove it by hand`);
    }
    console.log('Cleanup done.');
  }
}

main().catch((error) => {
  console.error(`smoke-private-sources failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
