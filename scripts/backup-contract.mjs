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
