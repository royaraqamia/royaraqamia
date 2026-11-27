/**
 * The recovery contract for the production Supabase database (#1700).
 *
 * Pure data and functions only. The dump verifier, the restore drill and their
 * network-free tests all read from here, so the recorded floor cannot drift
 * between the job that writes a backup and the job that proves it restores.
 */

/** Lower bounds measured on the production project on 2026-11-21. */
export const TABLE_FLOORS = Object.freeze({
  'public.users': 20,
  'public.notifications': 10000,
  'public.chat_messages': 50,
  'public.chat_attachments': 5,
  'supabase_migrations.schema_migrations': 255,
});

/** A file below these sizes is an empty or truncated dump, not a backup. */
export const MIN_FILE_BYTES = Object.freeze({
  'roles.sql': 50,
  'schema.sql': 20000,
  'data.sql': 50000,
  'history_schema.sql': 50,
  'history_data.sql': 50,
});

export const DUMP_FILES = Object.freeze(Object.keys(MIN_FILE_BYTES));

export class DumpError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DumpError';
  }
}

function unquoteIdentifier(identifier) {
  return identifier
    .split('.')
    .map((part) => part.replace(/^"|"$/g, ''))
    .join('.');
}

/**
 * Count rows in a `--use-copy --data-only` pg_dump by reading COPY blocks.
 * No network and no Postgres required, which is what lets the unit suite
 * exercise the same comparison the restore drill uses.
 */
export function parseCopyRowCounts(sql) {
  const lines = sql.split(/\r?\n/);
  const counts = new Map();

  for (let i = 0; i < lines.length; i += 1) {
    const header = /^COPY\s+(\S+)\s+\([^\n]*\)\s+FROM\s+stdin;\s*$/.exec(lines[i]);
    if (!header) continue;

    const table = unquoteIdentifier(header[1]);
    let rows = 0;
    let end = i + 1;
    for (; end < lines.length; end += 1) {
      if (lines[end] === '\\.') break;
      rows += 1;
    }
    counts.set(table, rows);
    i = end;
  }

  return counts;
}

/**
 * Files that are missing or smaller than their recorded floor.
 * @param {Record<string, number | null | undefined>} sizes
 * @param {Record<string, number>} minimums
 */
export function sizeViolations(sizes, minimums = MIN_FILE_BYTES) {
  const violations = [];
  for (const [file, floor] of Object.entries(minimums)) {
    const size = sizes[file];
    if (typeof size !== 'number' || !Number.isFinite(size)) {
      violations.push(`${file}: missing`);
    } else if (size < floor) {
      violations.push(`${file}: ${size} bytes, floor ${floor}`);
    }
  }
  return violations;
}

/** Tables whose row count is below the recorded floor. */
export function floorViolations(counts, floors = TABLE_FLOORS) {
  const violations = [];
  for (const [table, floor] of Object.entries(floors)) {
    const count = counts instanceof Map ? counts.get(table) : counts[table];
    if (typeof count !== 'number' || !Number.isFinite(count)) {
      violations.push(`${table}: absent from dump`);
    } else if (count < floor) {
      violations.push(`${table}: ${count} rows, floor ${floor}`);
    }
  }
  return violations;
}

/** Exact comparison used after a restore: the target must match the artifact. */
export function countMismatches(actual, expected) {
  const mismatches = [];
  for (const [table, count] of Object.entries(expected)) {
    const restored = actual instanceof Map ? actual.get(table) : actual[table];
    if (restored !== count) {
      mismatches.push(`${table}: restored ${String(restored)}, artifact ${count}`);
    }
  }
  return mismatches;
}

/**
 * Schemas a restore must never touch. Anything else the dump creates is owned
 * by the archive and has to be empty before the replay, or the drill lands on
 * rows a previous pass left behind (#1954).
 */
export const SYSTEM_SCHEMAS = Object.freeze(['pg_catalog', 'information_schema', 'pg_toast']);

/**
 * Every schema the artifact creates or writes rows into.
 *
 * Read from the dump rather than hard-coded: the first version of the drill
 * reset `public` only while the archive also restores `auth`, so the second
 * replay died on `flow_state_pkey`. The set has to follow the artifact.
 *
 * @param {{ schemaSql?: string, historySchemaSql?: string, dataSql?: string, historyDataSql?: string }} files
 */
export function schemasInDump({
  schemaSql = '',
  historySchemaSql = '',
  dataSql = '',
  historyDataSql = '',
} = {}) {
  const names = new Set(['public']);

  for (const sql of [schemaSql, historySchemaSql]) {
    for (const match of sql.matchAll(
      /^CREATE SCHEMA (?:IF NOT EXISTS )?(?:"((?:[^"]|"")+)"|([A-Za-z_][\w$]*))\s*;/gm
    )) {
      const name = (match[1] ?? match[2]).replace(/""/g, '"');
      if (!SYSTEM_SCHEMAS.includes(name)) names.add(name);
    }
  }

  for (const sql of [dataSql, historyDataSql]) {
    for (const match of sql.matchAll(/^COPY\s+(\S+)\s+\([^\n]*\)\s+FROM\s+stdin;\s*$/gm)) {
      const schema = unquoteIdentifier(match[1]).split('.')[0];
      if (schema && !SYSTEM_SCHEMAS.includes(schema)) names.add(schema);
    }
  }

  return [...names].sort();
}

/**
 * Roles the scratch project already owns and must keep. `supabase db dump
 * --role-only` emits the project's own login roles (this project's is
 * `cli_login_postgres`); dropping a platform role would break the project the
 * drill is restoring into.
 */
export const PLATFORM_ROLES = Object.freeze([
  'anon',
  'authenticated',
  'authenticator',
  'dashboard_user',
  'pgbouncer',
  'postgres',
  'service_role',
  'supabase_admin',
  'supabase_auth_admin',
  'supabase_storage_admin',
]);

/** The roles `roles.sql` will try to create, read from the artifact. */
export function rolesInDump(rolesSql = '') {
  const names = new Set();
  for (const match of rolesSql.matchAll(/^CREATE ROLE (?:"((?:[^"]|"")+)"|([A-Za-z_][\w$]*))/gm)) {
    const name = (match[1] ?? match[2]).replace(/""/g, '"');
    if (!PLATFORM_ROLES.includes(name)) names.add(name);
  }
  return [...names].sort();
}

/** Drop the roles the replay is about to create, so a second drill can run. */
export function resetRolesSql(roles) {
  return roles.map((name) => `DROP ROLE IF EXISTS "${name.replace(/"/g, '""')}";`).join('\n');
}

/** The reset the drill runs before replaying: drop everything the dump owns. */
export function resetScratchSql(schemas, roles = []) {
  const quoted = schemas.map((name) => `"${name.replace(/"/g, '""')}"`);
  const statements = [
    ...quoted.map((name) => `DROP SCHEMA IF EXISTS ${name} CASCADE;`),
    'CREATE SCHEMA IF NOT EXISTS public;',
    'GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;',
  ];
  // After the schemas: a role cannot be dropped while it still owns objects.
  const dropRoles = resetRolesSql(roles);
  if (dropRoles) statements.push(dropRoles);
  return statements.join('\n');
}

/** How many tables the reset should have left behind: zero, or stop. */
export function remainingTablesSql(schemas) {
  const list = schemas.map((name) => `'${name.replace(/'/g, "''")}'`).join(', ');
  return `SELECT count(*) FROM information_schema.tables WHERE table_schema IN (${list});`;
}

/** Markdown for the workflow summary and the drill record. */
export function summaryMarkdown(stats) {
  const rows = Object.entries(stats.counts ?? {})
    .map(([table, count]) => `- ${table}: ${count} rows`)
    .join('\n');
  const files = Object.entries(stats.sizes ?? {})
    .map(([file, size]) => `- ${file}: ${size} bytes`)
    .join('\n');
  const lines = [`### Database dump ${stats.createdAt ?? ''}`, ''];
  if (stats.source) lines.push(`- Source: ${stats.source}`);
  if (stats.archive) lines.push(`- Archive: ${stats.archive}`);
  if (files) lines.push(files);
  if (rows) lines.push(rows);
  return lines.join('\n');
}
