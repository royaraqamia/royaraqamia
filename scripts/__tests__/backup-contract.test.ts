import { describe, expect, it } from 'vitest';
import {
  PLATFORM_ROLES,
  TABLE_FLOORS,
  countMismatches,
  floorViolations,
  parseCopyRowCounts,
  remainingTablesSql,
  resetRolesSql,
  resetScratchSql,
  rolesInDump,
  schemasToReset,
  sizeViolations,
  tablesInDump,
  truncateTablesSql,
} from '../backup-contract.mjs';

const dump = `--
-- PostgreSQL database dump
--

COPY public.users (id, email) FROM stdin;
1\tone@example.com
2\ttwo@example.com
\\.

COPY "public"."chat_messages" (id, body) FROM stdin;
7\tsalam
8\tafwan
9\tmarhaban
\\.

COPY public.notifications (id) FROM stdin;
\\.
`;

describe('database backup contract (#1700)', () => {
  it('counts rows inside COPY blocks without a database', () => {
    const counts = parseCopyRowCounts(dump);
    expect(counts.get('public.users')).toBe(2);
    expect(counts.get('public.chat_messages')).toBe(3);
    expect(counts.get('public.notifications')).toBe(0);
  });

  it('reads migration history from its own dump, not from a public table that does not exist', () => {
    const history = `COPY supabase_migrations.schema_migrations (version) FROM stdin;\n20260101000000\n\\.\n`;
    const counts = new Map([...parseCopyRowCounts(dump), ...parseCopyRowCounts(history)]);
    expect(counts.get('supabase_migrations.schema_migrations')).toBe(1);
    expect(counts.get('public.schema_migrations')).toBeUndefined();
  });

  it('fails a dump whose recorded tables fall below their floor', () => {
    const counts = new Map([
      ['public.users', 24],
      ['public.notifications', 9999],
      ['public.chat_messages', 96],
      ['public.chat_attachments', 8],
      ['supabase_migrations.schema_migrations', 255],
    ]);
    expect(floorViolations(counts)).toEqual(['public.notifications: 9999 rows, floor 10000']);
  });

  it('fails a dump that lost a recorded table altogether', () => {
    const counts = new Map(Object.entries(TABLE_FLOORS));
    counts.delete('public.chat_attachments');
    expect(floorViolations(counts)).toEqual(['public.chat_attachments: absent from dump']);
  });

  it('compares restored counts exactly against the artifact', () => {
    const expected = { 'public.users': 24, 'public.notifications': 11225 };
    expect(
      countMismatches({ 'public.users': 24, 'public.notifications': 11225 }, expected)
    ).toEqual([]);
    expect(
      countMismatches({ 'public.users': 23, 'public.notifications': 11225 }, expected)
    ).toEqual(['public.users: restored 23, artifact 24']);
    expect(countMismatches({ 'public.users': 24 }, expected)).toEqual([
      'public.notifications: restored undefined, artifact 11225',
    ]);
  });

  it('rejects a missing or undersized dump file', () => {
    expect(sizeViolations({ 'schema.sql': 30000 }, { 'schema.sql': 20000 })).toEqual([]);
    expect(sizeViolations({ 'schema.sql': 10 }, { 'schema.sql': 20000 })).toEqual([
      'schema.sql: 10 bytes, floor 20000',
    ]);
    expect(sizeViolations({}, { 'data.sql': 50000 })).toEqual(['data.sql: missing']);
  });
});

describe('restore drill reset (#1954)', () => {
  const schemaSql = `CREATE SCHEMA "app";
CREATE SCHEMA pg_catalog;
`;
  const historySql = `CREATE SCHEMA supabase_migrations;
`;
  const dataSql = `COPY auth.flow_state (id) FROM stdin;

COPY public.users (id) FROM stdin;

COPY "app"."notes" (id) FROM stdin;
`;

  it('drops only the schemas the artifact creates', () => {
    expect(schemasToReset({ schemaSql, historySchemaSql: historySql })).toEqual([
      'app',
      'public',
      'supabase_migrations',
    ]);
    expect(schemasToReset({ schemaSql })).not.toContain('auth');
    expect(schemasToReset({ schemaSql })).not.toContain('pg_catalog');
    expect(schemasToReset({ schemaSql })).not.toContain('information_schema');
  });

  it('reads every table the replay fills', () => {
    expect(tablesInDump({ dataSql })).toEqual(['app.notes', 'auth.flow_state', 'public.users']);
  });

  it('truncates the platform-owned tables rather than dropping their schema', () => {
    expect(truncateTablesSql([])).toBe('');
    const sql = truncateTablesSql(['auth.flow_state', 'storage.objects']);
    expect(sql).toContain('TRUNCATE TABLE "auth"."flow_state", "storage"."objects" CASCADE;');
    expect(sql).toContain('SET session_replication_role = replica;');
  });

  it('drops each owned schema and re-creates public, then the roles', () => {
    const sql = resetScratchSql(['app', 'public'], ['cli_login_postgres']);
    expect(sql).toContain('DROP SCHEMA IF EXISTS "app" CASCADE;');
    expect(sql).toContain('DROP SCHEMA IF EXISTS "public" CASCADE;');
    expect(sql).not.toContain('"auth"');
    expect(sql.indexOf('CREATE SCHEMA IF NOT EXISTS public;')).toBeGreaterThan(
      sql.indexOf('DROP SCHEMA IF EXISTS "public" CASCADE;')
    );
    expect(sql.indexOf('DROP ROLE IF EXISTS "cli_login_postgres";')).toBeGreaterThan(
      sql.indexOf('CREATE SCHEMA IF NOT EXISTS public;')
    );
  });

  it('keeps the platform roles the scratch project needs', () => {
    const roles = rolesInDump(`CREATE ROLE cli_login_postgres;
CREATE ROLE "anon";
CREATE ROLE authenticated WITH LOGIN;
`);
    expect(roles).toEqual(['cli_login_postgres']);
    expect(PLATFORM_ROLES).toContain('anon');
    expect(resetRolesSql(roles)).toBe('DROP ROLE IF EXISTS "cli_login_postgres";');
  });

  it('asks for the table count over exactly the reset schemas', () => {
    expect(remainingTablesSql(['app', "o'brien"])).toBe(
      "SELECT count(*) FROM information_schema.tables WHERE table_schema IN ('app', 'o''brien');"
    );
  });
});
