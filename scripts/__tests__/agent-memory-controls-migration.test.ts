import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * What the member controls (ADR-0182 decision 6, #1428).
 *
 * There is no local Supabase stack, so the migration is the production code
 * path and these assertions read it. What is pinned is the issue's rule rather
 * than the comment header:
 *
 * - forgetting a fact deletes its embedding in the same transaction;
 * - forgetting a conversation forgets the thread facts, and touches nothing
 *   else (not the messages, not the summary);
 * - both run as a definer with the caller's own rows as the predicate, because
 *   a member holds no delete grant on the vectors;
 * - the per-scope toggle is a row recall reads, and a missing row means on.
 */

const file = resolve(process.cwd(), 'supabase/migrations/20261208120000_agent_memory_controls.sql');
const source = readFileSync(file, 'utf8');

/** Comments stripped so prose about a rule cannot satisfy a pin for it. */
const withoutComments = (sql: string) => sql.replace(/--[^\n]*/g, ' ');
/** One line, lower case, single-spaced: substrings survive the SQL formatting. */
const flatten = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase();

const sql = flatten(withoutComments(source));

function functionBody(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, `no ${name} definition`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf('$fn$;', start);
  expect(end, `${name} is not closed`).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe('the memory controls migration', () => {
  it('forgets the fact and its vector in one function, not two calls', () => {
    const body = functionBody('agent_memory_forget');
    expect(body).toContain('delete from public.agent_memory_embeddings e');
    expect(body).toContain('update public.agent_memories set deleted_at = now()');
    // The vector first, then the row, in the same body: a caller cannot run half.
    expect(body.indexOf('delete from public.agent_memory_embeddings')).toBeLessThan(
      body.indexOf('update public.agent_memories')
    );
  });

  it('answers a live fact only, so a second forget is not a second fact', () => {
    const body = functionBody('agent_memory_forget');
    expect(body).toContain('and deleted_at is null');
    expect(body).toContain('v_forgotten := found;');
    expect(body).toContain('return v_forgotten;');
  });

  it('forgets a conversation by its own key, and only the caller’s facts', () => {
    const body = functionBody('agent_memory_forget_thread');
    expect(body).toContain('and m.thread_id = p_thread_id');
    expect(body).toContain('and m.user_id = v_user');
    expect(body).toContain('where thread_id = p_thread_id and user_id = v_user');
    // The thread's messages, the conversation and its summary are other tables:
    // a function that named them would be doing something the button does not say.
    expect(body).not.toContain('chat_messages');
    expect(body).not.toContain('chat_conversations');
  });

  it('runs as a definer with the caller as the ownership check', () => {
    for (const name of ['agent_memory_forget', 'agent_memory_forget_thread']) {
      const body = functionBody(name);
      expect(body).toContain('security definer');
      expect(body).toContain("set search_path = 'public'");
      expect(body).toContain('if v_user is null then raise exception');
      expect(sql).toContain(`revoke all on function public.${name}(uuid) from public, anon`);
      expect(sql).toContain(
        `grant execute on function public.${name}(uuid) to authenticated, service_role`
      );
    }
  });

  it('keeps the settings owner-only, with no admin door and no anonymous read', () => {
    expect(sql).toContain('create table if not exists public.agent_memory_settings');
    expect(sql).toContain('user_id uuid primary key references auth.users (id) on delete cascade');
    expect(sql).toContain('using ( user_id = (select auth.uid()) )');
    expect(sql).toContain('revoke all on public.agent_memory_settings from anon, authenticated');
    expect(sql).toContain(
      'grant select, insert, update on public.agent_memory_settings to authenticated'
    );
  });

  it('defaults every scope to on, so a member with no row keeps their memory', () => {
    for (const column of ['account_enabled', 'product_enabled', 'thread_enabled']) {
      expect(sql).toContain(`${column} boolean not null default true`);
    }
    expect(sql).toContain('coalesce(s.account_enabled, true)');
    expect(sql).toContain('coalesce(s.product_enabled, true)');
    expect(sql).toContain('coalesce(s.thread_enabled, true)');
  });
});
