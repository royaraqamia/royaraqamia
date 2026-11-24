import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * There is no local Supabase stack, so the migration is the production code
 * path and these assertions read it (the pattern of
 * `chat-conversation-summary-migration.test.ts`). What is pinned is #1803's
 * acceptance: the bounded signature replaces the old one, the cursor follows
 * the agent-first order, and the badge has its own aggregate rather than the
 * list's four correlated subqueries.
 */

const migrationsDir = resolve(process.cwd(), 'supabase/migrations');

/** Comments are prose; a rollback note must not satisfy a pin for live SQL. */
const withoutComments = (sql: string) => sql.replace(/--[^\n]*/g, ' ');
const flatten = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase();

const file = readdirSync(migrationsDir)
  .filter((entry) => entry.endsWith('.sql'))
  .sort()
  .find((entry) =>
    readFileSync(resolve(migrationsDir, entry), 'utf8').includes(
      'create or replace function public.chat_unread_count()'
    )
  );

expect(file, 'no migration defines public.chat_unread_count()').toBeDefined();

const source = readFileSync(resolve(migrationsDir, file!), 'utf8');
const sql = flatten(withoutComments(source));

describe(`the bounded chats list (${file})`, () => {
  it('replaces the zero-argument function with a cursor and a page size', () => {
    expect(sql).toContain(
      'create function public.list_chat_threads( p_limit integer default 50, p_before timestamptz default null, p_before_id uuid default null )'
    );
    expect(sql).toContain('drop function if exists public.list_chat_threads()');
    expect(sql).toContain('revoke all on function public.list_chat_threads() from public, anon');
  });

  it('clamps the caller’s page instead of trusting it', () => {
    expect(sql).toContain('limit least(greatest(coalesce(p_limit, 50), 1), 2000)');
  });

  it('keysets on (last_message_at, id) after the pinned assistant row', () => {
    expect(sql).toContain(
      "order by (c.kind = 'agent') desc, coalesce(c.last_message_at, '-infinity'::timestamptz) desc, c.id desc"
    );
    expect(sql).toContain(
      "(coalesce(c.last_message_at, '-infinity'::timestamptz), c.id) < (p_before, coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid))"
    );
    expect(sql).toContain("c.kind <> 'agent'");
  });

  it('grants execution only to authenticated callers on both functions', () => {
    expect(sql).toContain(
      'grant execute on function public.list_chat_threads(integer, timestamptz, uuid) to authenticated'
    );
    expect(sql).toContain('grant execute on function public.chat_unread_count() to authenticated');
  });

  it('keeps both reads as security invoker, so RLS still decides the rows', () => {
    const definitions = sql.match(/language sql stable security invoker/g) ?? [];
    expect(definitions).toHaveLength(2);
  });
});

describe('the badge aggregate', () => {
  it('is one sum over the member’s own participant rows', () => {
    expect(sql).toContain('create or replace function public.chat_unread_count() returns integer');
    expect(sql).toContain('coalesce(sum(per_thread), 0)::integer');
    expect(sql).toContain('where me.user_id = (select auth.uid())');
  });

  it('does no last-line, attachment or proposal work the badge does not draw', () => {
    const body = /create or replace function public\.chat_unread_count\(\)[\s\S]*?\$\$;/.exec(
      source.replace(/--[^\n]*/g, ' ')
    )?.[0];
    expect(body).toBeDefined();
    expect(body).not.toContain('chat_attachments');
    expect(body).not.toContain('chat_agent_actions');
    expect(body).not.toContain('counterpart');
  });
});
