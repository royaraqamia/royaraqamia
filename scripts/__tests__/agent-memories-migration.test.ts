import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * `public.agent_memories` is the fact store of ADR-0182 (#1424). There is no
 * local Supabase stack, so the migration is the production code path and these
 * assertions read it: the last file that creates the table.
 *
 * What is pinned here is the issue's acceptance, not the comment header:
 *
 * - only the member reaches their own row, in all four directions, and nobody
 *   else - no admin door;
 * - a duplicate active fact cannot be inserted;
 * - deleting the account takes the rows with it, `auth.users` and cascade;
 * - the grants exist, because RLS chooses rows and grants decide whether the
 *   role reaches the table at all.
 */

const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
const CREATE = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.agent_memories\s*\(/i;

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
    if (!CREATE.test(source)) continue;
    latest = { file, sql: flatten(source) };
  }

  expect(latest, 'no migration creates public.agent_memories').toBeDefined();
  return latest as { file: string; sql: string };
}

const { file, sql } = latestDefinition();

/** Each `create policy "name" ... ;` block, so a clause is read where it lives. */
function policies(): { name: string; block: string }[] {
  const starts = [...sql.matchAll(/create policy "([^"]+)"/g)];
  return starts.map((match, index) => {
    const start = match.index ?? 0;
    const end = starts[index + 1]?.index ?? sql.length;
    return { name: match[1] as string, block: sql.slice(start, end) };
  });
}

describe(`public.agent_memories (${file})`, () => {
  it('turns row level security on', () => {
    expect(sql).toContain('alter table public.agent_memories enable row level security');
  });

  it('has the member own the row in every direction', () => {
    const byDirection = new Map<string, string>();

    for (const { name, block } of policies()) {
      const direction = / for (select|insert|update|delete)\b/.exec(block)?.[1];
      expect(direction, `policy "${name}" names no direction`).toBeDefined();
      byDirection.set(direction as string, block);
    }

    expect([...byDirection.keys()].sort()).toEqual(['delete', 'insert', 'select', 'update']);

    for (const [direction, block] of byDirection) {
      expect(block, `${direction} policy is not owner-scoped`).toContain(
        'user_id = (select auth.uid())'
      );
    }

    // An update could otherwise hand the row to another member: `using` chooses
    // the row, `with check` chooses what it may become.
    expect(byDirection.get('update')).toContain('with check ( user_id = (select auth.uid()) )');
  });

  it('has no admin door', () => {
    // A policy is either `to authenticated` or it is not a member policy.
    for (const { name, block } of policies()) {
      expect(block, `policy "${name}" is not limited to authenticated`).toContain(
        ' to authenticated '
      );
    }

    expect(sql).not.toMatch(/\bis_admin\b/);
    expect(sql).not.toMatch(/to\s+(public|anon|service_role)\b[\s\S]{0,200}create policy/);
  });

  it('deletes the rows with the account', () => {
    expect(sql).toContain('references auth.users (id) on delete cascade');
    // And not through a profile row's own cascade, which is a second hop that a
    // missing FK there would break silently.
    expect(sql).not.toContain('references public.users');
  });

  it('makes a duplicate active fact impossible, and only among active ones', () => {
    const unique =
      /create unique index if not exists (\w+)\s+on public\.agent_memories \(([\s\S]*?)\)\s*nulls not distinct\s*where deleted_at is null;/.exec(
        sql
      );

    expect(unique, 'no unique index on public.agent_memories').not.toBeNull();
    const [, name, columns] = unique as RegExpExecArray;

    expect(name).toBe('uq_agent_memories_active_fact');
    expect(columns).toContain('user_id');
    expect(columns).toContain('scope');
    // The fact text is compared case- and padding-insensitively, so "أحب القهوة"
    // and " أحب القهوة " are one fact.
    expect(columns).toContain('lower(btrim(text))');
    // `nulls not distinct` above is what makes the null `product` of an `account`
    // row compare equal to the next one; without it every such row is distinct
    // and the index guards nothing. `where deleted_at is null` is what lets a
    // forgotten fact be remembered again as a new row.
  });

  it('indexes the read and the cascade, not just the pair', () => {
    expect(sql).toContain('on public.agent_memories (user_id, created_at desc)');
    // The foreign key's own index: an account deletion must not scan the table.
    expect(sql).toContain('on public.agent_memories (user_id);');
  });

  it('keeps one key per scope', () => {
    expect(sql).toContain("scope in ('account', 'product', 'thread')");
    expect(sql).toContain("kind in ('fact', 'preference', 'health', 'legal', 'financial')");
    expect(sql).toContain('confidence between 0 and 1');
    expect(sql).toContain('length(btrim(text)) between 1 and 500');
    expect(sql).toContain("scope = 'product' and product is not null and thread_id is null");
    expect(sql).toContain("scope = 'thread' and thread_id is not null and product is null");
    expect(sql).toContain("scope = 'account' and product is null and thread_id is null");
  });

  it('survives the turn it was written from', () => {
    // A pruned turn must not take the member's saved fact with it.
    expect(sql).toContain('references public.agent_turns (id) on delete set null');
  });

  it('grants the roles that reach it, and denies the one that must not', () => {
    expect(sql).toContain('revoke all on public.agent_memories from anon, authenticated');
    expect(sql).toContain(
      'grant select, insert, update, delete on public.agent_memories to authenticated'
    );
    expect(sql).toContain('grant all on public.agent_memories to service_role');
  });
});
