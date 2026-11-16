import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

import { EMBEDDING_GENERATION } from '@/backend/shared/domain/agent-memory';

/**
 * The 1536 generation leaves (#1554, ADR-0200 decision 5).
 *
 * `20261210120000` built the 1024 pair and kept the 1536 one readable on
 * purpose, because dropping it before the backfill would have destroyed the only
 * vectors the deployment had. This file is the follow-through, and these
 * assertions read it the way the others read their migrations: there is no local
 * Supabase stack, so the SQL is the production code path.
 *
 * What is pinned:
 *
 * - the old function goes before the old table, which it reads;
 * - the drop is not `cascade`, so a reader nobody noticed fails loudly instead of
 *   being pulled out from under;
 * - the forget pair is rewritten in the same file, because their bodies named
 *   the old table and the drop would otherwise be a runtime failure at the
 *   forget buttons;
 * - the 1024 generation is not touched.
 */

const file = resolve(
  process.cwd(),
  'supabase/migrations/20261211120000_drop_agent_memory_embeddings_1536.sql'
);
const source = readFileSync(file, 'utf8');
const types = readFileSync(resolve(process.cwd(), 'backend/models/database.types.ts'), 'utf8');

/** Comments stripped so prose about a rule cannot satisfy a pin for it. */
const withoutComments = (sql: string) => sql.replace(/--[^\n]*/g, ' ');
/** One line, lower case, single-spaced: substrings survive the SQL formatting. */
const flatten = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase();

const sql = flatten(withoutComments(source));
const OLD_TABLE = 'public.agent_memory_embeddings';
const OLD_FUNCTION = 'public.agent_memory_nearest';
const NEW_TABLE = EMBEDDING_GENERATION.table;

function functionBody(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, `no ${name} definition`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf('$fn$;', start);
  expect(end, `${name} is not closed`).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe('the 1536 generation leaves', () => {
  it('drops the function before the table it reads', () => {
    const functionDrop = sql.indexOf(`drop function if exists ${OLD_FUNCTION}(`);
    const tableDrop = sql.indexOf(`drop table if exists ${OLD_TABLE}`);

    expect(functionDrop, 'the old function is not dropped').toBeGreaterThanOrEqual(0);
    expect(tableDrop, 'the old table is not dropped').toBeGreaterThanOrEqual(0);
    expect(functionDrop).toBeLessThan(tableDrop);
  });

  it('drops without cascade, so an unknown reader stops the drop instead of vanishing', () => {
    expect(sql).toMatch(new RegExp(`drop table if exists ${OLD_TABLE}(?:;| )`));
    expect(sql).not.toContain('cascade');
  });

  it('leaves the 1024 generation and the settings table alone', () => {
    expect(sql).not.toMatch(
      new RegExp(`drop\\s+(table|function)\\s+(if exists\\s+)?public\\.${NEW_TABLE}`)
    );
    expect(sql).not.toContain('drop table if exists public.agent_memory_settings');
    expect(sql).not.toContain('disable row level security');
  });
});

describe('forgetting, after the drop', () => {
  it('no longer names the dropped table', () => {
    for (const name of ['agent_memory_forget', 'agent_memory_forget_thread']) {
      expect(functionBody(name)).not.toContain(`delete from ${OLD_TABLE} e`);
    }
  });

  it('deletes the vector from the current generation, then the fact', () => {
    for (const name of ['agent_memory_forget', 'agent_memory_forget_thread']) {
      const body = functionBody(name);
      expect(body).toContain(`delete from public.${NEW_TABLE} e`);
      expect(body.indexOf(`delete from public.${NEW_TABLE}`)).toBeLessThan(
        body.indexOf('update public.agent_memories')
      );
    }
  });

  it('still guards on the caller in both paths', () => {
    expect(sql.match(/m\.user_id = v_user/g)).toHaveLength(2);
    for (const name of ['agent_memory_forget', 'agent_memory_forget_thread']) {
      const body = functionBody(name);
      expect(body).toContain('security definer');
      expect(body).toContain('raise exception');
    }
  });
});

describe('the stale types', () => {
  it('carry neither the dropped table nor its function', () => {
    expect(types).not.toContain('agent_memory_embeddings: {');
    expect(types).not.toContain('agent_memory_nearest: {');
    expect(types).toContain('agent_memory_embeddings_1024: {');
    expect(types).toContain('agent_memory_nearest_1024: {');
  });
});
