import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * `chat_conversations` carries the rolling summary (ADR-0182 decision 4, #1512).
 * There is no local Supabase stack, so the migration is the production code path
 * and these assertions read it: the last file that adds the summary columns.
 *
 * What is pinned is the issue's acceptance and the decision behind it, not the
 * comment header:
 *
 * - the cursor is a **message id**, not a count, and a deleted message clears it
 *   rather than shifting what the summary claims to cover;
 * - the summary is bounded in the column as well as in the service, because the
 *   block is injected on every turn;
 * - a cursor without a summary, and a stamped summary without text, cannot exist;
 * - no policy or grant is added: the member's existing `select` on the row and
 *   the service role's `update` already cover these columns.
 */

const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
const CREATE =
  /alter\s+table\s+public\.chat_conversations[\s\S]*?add\s+column\s+if\s+not\s+exists\s+summary\s+text/i;

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

  expect(latest, 'no migration adds a summary to public.chat_conversations').toBeDefined();
  return latest as { file: string; sql: string };
}

const { file, sql } = latestDefinition();

describe(`public.chat_conversations' summary (${file})`, () => {
  it('adds the text, the cursor and the stamp to the conversation itself', () => {
    expect(sql).toContain('add column if not exists summary text');
    expect(sql).toContain('add column if not exists summary_through_message_id uuid');
    expect(sql).toContain('add column if not exists summary_updated_at timestamptz');
  });

  it('points its cursor at a message, not at a number of messages', () => {
    // A count would silently re-point itself the moment a message above it was
    // deleted; an id clears instead, and the next regeneration starts over.
    expect(sql).toContain('references public.chat_messages (id) on delete set null');
    expect(sql).not.toMatch(/summary_through_message_count|summary_message_count/);
  });

  it('bounds the text where it is stored, because it is injected on every turn', () => {
    expect(sql).toContain('constraint chat_conversations_summary_bounded');
    expect(sql).toContain('check (summary is null or char_length(summary) between 1 and 1200)');
  });

  it('refuses a cursor without a summary, and a stamp without text', () => {
    expect(sql).toContain('constraint chat_conversations_summary_cursor_needs_summary');
    expect(sql).toContain('check (summary_through_message_id is null or summary is not null)');
    expect(sql).toContain('constraint chat_conversations_summary_stamped');
    expect(sql).toContain('check ((summary is null) = (summary_updated_at is null))');
  });

  it('indexes the foreign key, so deleting a message does not scan the table', () => {
    expect(sql).toContain(
      'create index if not exists idx_chat_conversations_summary_cursor on public.chat_conversations (summary_through_message_id)'
    );
  });

  it('adds no policy and no grant: the columns ride on the row they are on', () => {
    // The member reads the row through the existing "Members read their
    // conversations" policy, and the service role already holds `update`.
    expect(sql).not.toContain('create policy');
    expect(sql).not.toMatch(/\bgrant\b/);
    expect(sql).not.toMatch(/\brevoke\b/);
  });

  it('carries a rollback that drops what it added, in reverse order', () => {
    const source = readFileSync(resolve(migrationsDir, file), 'utf8');
    const rollback = /-- Rollback:([\s\S]*?)$/.exec(source)?.[1] ?? '';

    expect(rollback).toContain('drop index if exists');
    expect(rollback.indexOf('drop column if exists summary_updated_at')).toBeGreaterThan(-1);
    expect(rollback.indexOf('drop column if exists summary_through_message_id')).toBeGreaterThan(
      rollback.indexOf('drop column if exists summary_updated_at')
    );
    expect(rollback.indexOf('drop column if exists summary;')).toBeGreaterThan(
      rollback.indexOf('drop column if exists summary_through_message_id')
    );
  });
});
