import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * The scope a recall answers inside (ADR-0182 decision 3, #1510).
 *
 * There is no local Supabase stack, so the migration is the production code path
 * and these assertions read it: the last file that defines
 * `agent_memory_nearest` is the one a turn calls. What is pinned is the issue's
 * rule, not the comment header:
 *
 * - a thread-scoped fact is recalled only in its own thread;
 * - a product fact only where the turn knows the product, and only that one;
 * - an account fact everywhere;
 * - a deleted fact never, and the cap never above the one recall injects.
 */

const migrationsDir = resolve(process.cwd(), 'supabase/migrations');

/** Comments stripped so prose about a rule cannot satisfy a pin for it. */
const withoutComments = (sql: string) => sql.replace(/--[^\n]*/g, ' ');

/** One line, lower case, single-spaced: substrings survive the SQL formatting. */
const flatten = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase();

function latestDefinition(): { file: string; sql: string } {
  let latest: { file: string; sql: string } | undefined;

  for (const file of readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()) {
    const source = withoutComments(readFileSync(resolve(migrationsDir, file), 'utf8'));
    if (!/create\s+or\s+replace\s+function\s+public\.agent_memory_nearest\s*\(/i.test(source))
      continue;
    latest = { file, sql: flatten(source) };
  }

  expect(latest, 'no migration defines public.agent_memory_nearest').toBeDefined();
  return latest as { file: string; sql: string };
}

const { file, sql } = latestDefinition();

describe(`public.agent_memory_nearest (${file})`, () => {
  it('drops the three-argument function, so one call cannot match two signatures', () => {
    expect(sql).toContain(
      'drop function if exists public.agent_memory_nearest(uuid, extensions.vector, integer)'
    );
  });

  it('takes the two scope keys, defaulted so an account-only call still means something', () => {
    const args =
      /create or replace function public\.agent_memory_nearest\(([\s\S]*?)\) returns table/.exec(
        sql
      )?.[1];

    expect(args, 'no agent_memory_nearest definition').toBeDefined();
    expect(args).toContain('p_thread_id uuid default null');
    expect(args).toContain('p_product text default null');
    // The width and the member stay the caller's, never a guess.
    expect(args).toContain('p_user_id uuid');
    expect(args).toContain('p_query extensions.vector');
  });

  it('runs as the caller, so the policies it reads are still the boundary', () => {
    expect(sql).toContain('security invoker');
    expect(sql).toContain('set search_path = public, extensions');
  });

  it('recalls each scope where it belongs, and nowhere else', () => {
    expect(sql).toContain("m.scope = 'account'");
    expect(sql).toContain(
      "or (m.scope = 'product' and p_product is not null and m.product = p_product)"
    );
    expect(sql).toContain(
      "or (m.scope = 'thread' and p_thread_id is not null and m.thread_id = p_thread_id)"
    );
  });

  it('never answers a deleted fact, one member’s other rows, or more than the cap', () => {
    expect(sql).toContain('where e.user_id = p_user_id and m.deleted_at is null');
    expect(sql).toContain('order by e.embedding <=> p_query');
    expect(sql).toContain('limit greatest(1, least(coalesce(p_limit, 6), 24))');
  });

  it('grants the new signature exactly to the roles that call it', () => {
    expect(sql).toContain(
      'revoke all on function public.agent_memory_nearest(uuid, extensions.vector, integer, uuid, text) from public, anon'
    );
    expect(sql).toContain(
      'grant execute on function public.agent_memory_nearest(uuid, extensions.vector, integer, uuid, text) to authenticated, service_role'
    );
  });
});
