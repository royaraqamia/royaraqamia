import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

import { EMBEDDING_GENERATION } from '@/backend/shared/domain/agent-memory';

/**
 * The scope a recall answers inside (ADR-0182 decision 3, #1510), at the
 * generation whose function a turn calls (#1550).
 *
 * There is no local Supabase stack, so the migration is the production code path
 * and these assertions read it: the last file that defines the generation's own
 * nearest function is the one recall runs. What is pinned is the issue's rule,
 * not the comment header:
 *
 * - a thread-scoped fact is recalled only in its own thread;
 * - a product fact only where the turn knows the product, and only that one;
 * - an account fact everywhere;
 * - a deleted fact never, and the cap never above the one recall injects.
 */

const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
const NEAREST = EMBEDDING_GENERATION.nearestFunction;
const SIGNATURE = `${NEAREST}(uuid, extensions.vector, integer, uuid, text)`;

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
    if (
      !new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${NEAREST}\\s*\\(`, 'i').test(
        source
      )
    )
      continue;
    latest = { file, sql: flatten(source) };
  }

  expect(latest, `no migration defines public.${NEAREST}`).toBeDefined();
  return latest as { file: string; sql: string };
}

const { file, sql } = latestDefinition();

describe(`public.${NEAREST} (${file})`, () => {
  it('answers one signature, so a call cannot match two', () => {
    // The three-argument function was dropped by #1510; what keeps the pair from
    // coming back is that only the five-argument one is granted to a caller.
    expect(sql).toContain(
      `grant execute on function public.${SIGNATURE} to authenticated, service_role`
    );
  });

  it('takes the two scope keys, defaulted so an account-only call still means something', () => {
    const args = new RegExp(
      `create or replace function public\\.${NEAREST}\\(([\\s\\S]*?)\\) returns table`
    ).exec(sql)?.[1];

    expect(args, `no ${NEAREST} definition`).toBeDefined();
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
    // The toggles are the reason each branch is more than a scope test: a scope
    // the member switched off is not injected, and a missing row means on.
    expect(sql).toContain("(m.scope = 'account' and coalesce(s.account_enabled, true))");
    expect(sql).toContain(
      "or ( m.scope = 'product' and p_product is not null and m.product = p_product and coalesce(s.product_enabled, true) )"
    );
    expect(sql).toContain(
      "or ( m.scope = 'thread' and p_thread_id is not null and m.thread_id = p_thread_id and coalesce(s.thread_enabled, true) )"
    );
    expect(sql).toContain('left join public.agent_memory_settings s on s.user_id = p_user_id');
  });

  it('never answers a deleted fact, one member’s other rows, or more than the cap', () => {
    expect(sql).toContain('where e.user_id = p_user_id and m.deleted_at is null');
    expect(sql).toContain('order by e.embedding <=> p_query');
    expect(sql).toContain('limit greatest(1, least(coalesce(p_limit, 6), 24))');
  });

  it('grants the new signature exactly to the roles that call it', () => {
    expect(sql).toContain(`revoke all on function public.${SIGNATURE} from public, anon`);
    expect(sql).toContain(
      `grant execute on function public.${SIGNATURE} to authenticated, service_role`
    );
  });
});
