import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * `public.follow_edge` is the follow write (#1374): resolve the handle, judge
 * the target, insert or delete the edge and answer the target's numbers in one
 * call. There is no local Supabase stack, so the migration body is the
 * production code path - these assertions read the last file that defines the
 * function and pin the rules the service and the route depend on:
 *
 * - who may call it (it acts as the follower it is handed);
 * - that `self` is answered before a block is asked about;
 * - that the pair, not a read, decides a repeat;
 * - that the numbers are read after the write they describe.
 */

const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
const DEFINITION = /create\s+or\s+replace\s+function\s+public\.follow_edge\s*\(/i;
const BODY = /\$\$([\s\S]*?)\$\$/;

/** Comments stripped so the prose above the function cannot satisfy a pin. */
const withoutComments = (sql: string) => sql.replace(/--[^\n]*/g, ' ');

/** One line, lower case, single-spaced: substrings survive the SQL formatting. */
const flatten = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase();

function latestDefinition(): { file: string; sql: string; body: string } {
  let latest: { file: string; sql: string; body: string } | undefined;

  for (const file of readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()) {
    const source = withoutComments(readFileSync(resolve(migrationsDir, file), 'utf8'));
    if (!DEFINITION.test(source)) continue;

    const body = BODY.exec(source)?.[1];
    expect(body, `${file}: no $$ body after the definition`).toBeDefined();
    latest = { file, sql: flatten(source), body: flatten(body as string) };
  }

  expect(latest, 'no migration defines public.follow_edge').toBeDefined();
  return latest as { file: string; sql: string; body: string };
}

const definition = latestDefinition();

describe('public.follow_edge', () => {
  it('is executable by the service role alone', () => {
    // It writes as the follower id it is handed, so a client role that could
    // call it could follow on somebody else's behalf.
    expect(definition.sql).toContain(
      'revoke all on function public.follow_edge(uuid, text, boolean) from public, anon, authenticated'
    );
    expect(definition.sql).toContain(
      'grant execute on function public.follow_edge(uuid, text, boolean) to service_role'
    );
    expect(definition.sql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.follow_edge\([^)]*\)\s+to\s+service_role;/
    );
  });

  it('runs as its own definer with a fixed search path', () => {
    expect(definition.sql).toContain('security definer');
    expect(definition.sql).toContain("set search_path = 'public'");
  });

  it('answers self before it asks whether either side blocked the other', () => {
    const self = definition.body.indexOf("v_outcome := 'self'");
    const blocked = definition.body.indexOf("v_outcome := 'blocked'");

    expect(self).toBeGreaterThan(-1);
    expect(blocked).toBeGreaterThan(self);
  });

  it('refuses a hidden or unconfirmed member as absent, before any write', () => {
    const absent = definition.body.indexOf("'not_found'");
    const insert = definition.body.indexOf('insert into public.follows');

    expect(absent).toBeGreaterThan(-1);
    expect(absent).toBeLessThan(insert);
    expect(definition.body).toContain('v_target.verified is not true');
    expect(definition.body).toContain('v_target.is_hidden is true');
  });

  it('lets the pair decide a repeat, not a read', () => {
    expect(definition.body).toContain('insert into public.follows (follower_id, followee_id)');
    expect(definition.body).toContain('on conflict (follower_id, followee_id) do nothing');
  });

  it('reads the numbers after the write it describes', () => {
    const insert = definition.body.indexOf('insert into public.follows');
    const counts = definition.body.indexOf('select (select count(*) from public.follows');

    expect(counts).toBeGreaterThan(insert);
  });

  it('names the follower only for the call that wrote the edge', () => {
    const wrote = definition.body.indexOf('if v_wrote then');
    const name = definition.body.indexOf('select u.name, u.username');

    expect(wrote).toBeGreaterThan(-1);
    expect(name).toBeGreaterThan(wrote);
  });
});
