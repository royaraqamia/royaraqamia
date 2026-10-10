import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
const STATEMENT_ONLY = readFileSync(
  resolve(migrationsDir, '20261010120000_offline_write_contract.sql'),
  'utf8'
);
const sql = STATEMENT_ONLY.replace(/\s+/g, ' ').toLowerCase();

const OWNED_TABLES = [
  'habits',
  'habit_logs',
  'expenses',
  'expense_splits',
  'budgets',
  'categories',
  'recurring_expenses',
  'short_links',
];

describe('offline write contract migration (#162)', () => {
  it('is present and additive only', () => {
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
    expect(files).toContain('20261010120000_offline_write_contract.sql');
    expect(sql).not.toMatch(/drop (table|column)|truncate/);
  });

  it('adds the (client_id, updated_at, deleted_at) trio to every owned table', () => {
    for (const column of ['client_id uuid', 'updated_at timestamptz', 'deleted_at timestamptz']) {
      expect(sql, `missing: ${column}`).toContain(`add column if not exists ${column}`);
    }
  });

  it('lists exactly the owned tables in scope', () => {
    for (const table of OWNED_TABLES) {
      expect(sql).toContain(`'${table}'`);
    }
    // BlogPress `posts` keys ownership on author_id and needs feed filtering
    // first — deliberately deferred to #168.
    expect(sql).not.toContain(`'posts'`);
  });

  it('creates the idempotent upsert index on (user_id, client_id)', () => {
    expect(sql).toContain('create unique index if not exists');
    expect(sql).toContain('(user_id, client_id)');
  });

  it('keys expense_splits on (expense_id, client_id) — it has no user_id', () => {
    expect(sql).toContain('(expense_id, client_id)');
    expect(sql).toContain("t = 'expense_splits'");
  });

  it('does not weaken RLS and introduces no service-role path', () => {
    expect(sql).not.toMatch(/disable row level security/);
    expect(sql).not.toMatch(/service_role/);
  });
});
