import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * `public.publish_due_scheduled_posts` is the only writer that moves a scheduled
 * Community Post to published, and it runs inside Postgres under pg_cron, so the
 * SQL is the production code path. There is no local Supabase stack — these
 * assertions read the latest definition out of the migration history (a later
 * `create or replace` wins, as on the project) and pin the rules #570 depends
 * on: only due, live rows are touched, the published cap and the publish credit
 * are charged in the same transaction, and a refused or lost row is left
 * scheduled with nothing charged.
 */

const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
const FUNCTION = 'public.publish_due_scheduled_posts';
const JOB = 'publish-due-scheduled-posts';

const DEFINITION = /create\s+or\s+replace\s+function\s+public\.publish_due_scheduled_posts\s*\(/i;
const BODY = /\$fn\$([\s\S]*?)\$fn\$/;

/** Comments stripped so the prose above the function cannot satisfy a pin. */
const withoutComments = (sql: string) => sql.replace(/--[^\n]*/g, ' ');

/** One line, lower case, single-spaced: substrings survive the SQL formatting. */
const flatten = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase();

function latestSql(): { sql: string; body: string } {
  let latest: { sql: string; body: string } | undefined;

  for (const file of readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()) {
    const source = withoutComments(readFileSync(resolve(migrationsDir, file), 'utf8'));
    if (!DEFINITION.test(source)) continue;

    const body = BODY.exec(source)?.[1];
    expect(body, `${file}: no $fn$ body after the definition`).toBeDefined();
    latest = { sql: flatten(source), body: flatten(body as string) };
  }

  expect(latest, `no migration defines ${FUNCTION}`).toBeDefined();
  return latest as { sql: string; body: string };
}

const { sql, body } = latestSql();

describe('the scheduled-post promotion', () => {
  it('is defined in the migration history', () => {
    expect(body).not.toBe('');
  });

  it('is a search-path-pinned security definer', () => {
    expect(sql).toContain('security definer');
    expect(sql).toContain("set search_path = 'public'");
  });

  it('stays unreachable by the client roles', () => {
    expect(sql).toContain(
      `revoke execute on function ${FUNCTION}() from public, anon, authenticated;`
    );
  });

  it('is scheduled every five minutes, idempotently', () => {
    expect(sql).toContain(
      `if not exists (select 1 from cron.job where jobname = '${JOB}') then perform cron.schedule( '${JOB}', '*/5 * * * *'`
    );
  });

  it('reads only due, live, still-scheduled rows, and skips the ones it cannot lock', () => {
    expect(body).toContain("where p.status = 'scheduled'");
    expect(body).toContain('and p.publish_at is not null');
    expect(body).toContain('and p.publish_at <= now()');
    expect(body).toContain('and p.deleted_at is null');
    expect(body).toContain('for update skip locked');
  });

  it('takes the published slot and survives a refusal', () => {
    expect(body).toContain(
      "perform private.assert_owned_item_cap(v_due.author_id, 'community_published');"
    );
    expect(body).toMatch(/when sqlstate 'pl001' then continue;/);
  });

  it('spends one publish credit, and keeps the row scheduled when it cannot', () => {
    expect(body).toContain(
      "v_spend := public.spend_credits(v_due.author_id, 'community.post.publish');"
    );
    expect(body).toContain(
      "if not coalesce((v_spend ->> 'allowed')::boolean, false) then continue; end if;"
    );
  });

  it('tolerates an Admin spend, which carries no event to refund', () => {
    expect(body).toContain("v_event_id := nullif(v_spend ->> 'eventid', '')::uuid;");
    expect(body).toContain('elsif v_event_id is not null then');
  });

  it('publishes the row it locked, and only while it is still a live scheduled row', () => {
    expect(body).toContain("set status = 'published'");
    expect(body).toContain('published_at = coalesce(p.publish_at, now())');
    expect(body).toContain('community_visible = true');
    expect(body).toContain('where p.id = v_due.id');
    expect(body).toContain("and p.status = 'scheduled'");
  });

  it('refunds the credit when the guarded update loses the row', () => {
    expect(body).toContain('perform public.refund_credits(v_due.author_id, v_event_id);');
  });
});
