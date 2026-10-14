import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  findUnsafeStatements,
  main,
  pendingMigrations,
  statements,
} from '../check-migration-safety.mjs';

const tempDirs = [];

function migrationsDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'safety-'));
  tempDirs.push(dir);
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
  return dir;
}

const collect = () => {
  const lines = [];
  return { lines, log: (line) => lines.push(String(line)) };
};

const jsonResponse = (payload) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: async () => payload,
  text: async () => JSON.stringify(payload),
});

const env = { SUPABASE_ACCESS_TOKEN: 'sbp_test', SUPABASE_PROJECT_REF: 'abcdefghijklmnop' };

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('statements', () => {
  it('drops comments and splits on semicolons', () => {
    expect(statements('-- a note; not a statement\nselect 1; /* x; y */ select 2;')).toEqual([
      'select 1',
      'select 2',
    ]);
  });
});

describe('findUnsafeStatements', () => {
  const reasons = (sql) => findUnsafeStatements(sql).map((f) => f.reason);

  it('leaves an ordinary migration alone', () => {
    expect(
      reasons(`
        create table if not exists public.widgets (id bigint primary key);
        alter table public.widgets enable row level security;
        create policy "widgets read" on public.widgets for select using (true);
        create index if not exists widgets_id_idx on public.widgets (id);
        grant select on public.widgets to authenticated;
      `)
    ).toEqual([]);
  });

  it('does not read a rollback note as a statement', () => {
    expect(
      reasons(`
        -- rollback: drop table if exists public.widgets;
        --   alter table public.widgets drop column if exists label;
        create table if not exists public.widgets (id bigint primary key);
      `)
    ).toEqual([]);
  });

  it('does not mistake a privilege list for TRUNCATE', () => {
    expect(
      reasons(`
        revoke insert, update, delete, truncate, references, trigger on public.users from anon;
      `)
    ).toEqual([]);
  });

  it('allows the idempotent drop-then-recreate idiom', () => {
    expect(
      reasons(`
        drop policy if exists "widgets read" on public.widgets;
        create policy "widgets read" on public.widgets for select using (true);
        drop function if exists public.widget_count(public.widgets);
        create or replace function public.widget_count(w public.widgets) returns int language sql as 'select 1';
      `)
    ).toEqual([]);
  });

  it('refuses a drop whose object the file does not recreate', () => {
    expect(reasons('drop policy if exists "widgets read" on public.widgets;')).toEqual([
      'drops a policy the same file does not recreate',
    ]);
    expect(reasons('drop function if exists public.widget_count(public.widgets);')).toEqual([
      'drops a function the same file does not recreate',
    ]);
  });

  it('refuses tables, columns, truncates and row level security being turned off', () => {
    expect(reasons('drop table if exists public.widgets;')).toEqual(['drops a table or a schema']);
    expect(reasons('drop schema if exists scratch cascade;')).toEqual([
      'drops a table or a schema',
    ]);
    expect(reasons('alter table public.widgets drop column if exists label;')).toEqual([
      'drops a column',
    ]);
    expect(reasons('truncate public.widgets;')).toEqual(['truncates a table']);
    expect(reasons('alter table public.widgets disable row level security;')).toEqual([
      'turns row level security off',
    ]);
  });

  it('refuses writes to Auth, Storage, and unwatched deletes', () => {
    expect(reasons('update auth.users set email = lower(email);')).toEqual([
      'writes to auth.users',
    ]);
    expect(reasons("insert into storage.buckets (id) values ('icons');")).toEqual([
      'changes Storage buckets or objects',
    ]);
    expect(reasons('delete from public.widgets;')).toEqual(['deletes rows without a WHERE clause']);
    expect(reasons('delete from public.widgets where created_at < now();')).toEqual([]);
  });

  it('reports every offending statement, not just the first', () => {
    expect(reasons('drop table public.a; truncate public.b;')).toHaveLength(2);
  });
});

describe('pendingMigrations', () => {
  it('keeps the repo order and drops what the project has already recorded', () => {
    const local = [
      { version: '20260101000000', file: '20260101000000_first.sql' },
      { version: '20260102000000', file: '20260102000000_second.sql' },
      { version: '20260103000000', file: '20260103000000_third.sql' },
    ];

    expect(pendingMigrations(local, ['20260101000000', '20260103000000'])).toEqual([
      { version: '20260102000000', file: '20260102000000_second.sql' },
    ]);
  });
});

describe('main', () => {
  const safe = migrationsDir({
    '20260101000000_first.sql':
      'create table if not exists public.widgets (id bigint primary key);\n',
  });
  const unsafe = migrationsDir({
    '20260101000000_first.sql': 'drop table public.widgets;\n',
  });

  const remote = (versions) =>
    jsonResponse({ migrations: versions.map((version) => ({ version, name: 'x' })) });

  it('skips without secrets instead of guessing', async () => {
    const { lines, log } = collect();
    const fetchImpl = () => {
      throw new Error('must not be called');
    };

    expect(await main({ env: {}, log, fetchImpl, localDir: safe })).toBe(0);
    expect(lines.join('\n')).toContain('Skipping');
  });

  it('reports nothing to do when the project already has every file', async () => {
    const { lines, log } = collect();

    expect(
      await main({ env, log, fetchImpl: async () => remote(['20260101000000']), localDir: safe })
    ).toBe(0);
    expect(lines.join('\n')).toContain('Nothing pending');
  });

  it('clears a routine migration for unattended apply, and names it', async () => {
    const { lines, log } = collect();

    expect(await main({ env, log, fetchImpl: async () => remote([]), localDir: safe })).toBe(0);
    const output = lines.join('\n');
    expect(output).toContain('20260101000000_first.sql');
    expect(output).toContain('Safe to apply unattended');
  });

  it('refuses a destructive migration and says which statement and why', async () => {
    const { lines, log } = collect();

    expect(await main({ env, log, fetchImpl: async () => remote([]), localDir: unsafe })).toBe(1);
    const output = lines.join('\n');
    expect(output).toContain('20260101000000_first.sql: drops a table or a schema');
    expect(output).toContain('supabase link --project-ref <ref> && supabase db push');
  });

  it('fails when the history cannot be read', async () => {
    const { lines, log } = collect();
    const refusing = async () => ({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => '{"message":"Forbidden action"}',
      json: async () => ({}),
    });

    expect(await main({ env, log, fetchImpl: refusing, localDir: safe })).toBe(1);
    expect(lines.join('\n')).toContain('403 Forbidden');
  });
});
