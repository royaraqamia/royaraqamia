#!/usr/bin/env node
/**
 * Restore drill for the scheduled database backup (#1700).
 *
 * Replays a verified dump into a scratch project with psql, then asserts that
 * every recorded table has exactly the row count the artifact carries and is
 * above its floor. Any mismatch is a non-zero exit, so a scheduled drill that
 * silently restores half a database cannot be mistaken for a pass.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DumpError,
  TABLE_FLOORS,
  countMismatches,
  floorViolations,
  parseCopyRowCounts,
  remainingTablesSql,
  resetScratchSql,
  rolesInDump,
  schemasToReset,
  tablesInDump,
  truncateTablesSql,
} from './backup-contract.mjs';

function options(argv) {
  const result = { dir: null, dbUrl: process.env.RESTORE_DB_URL ?? null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dir') result.dir = argv[++i];
    else if (argv[i] === '--db-url') result.dbUrl = argv[++i];
    else throw new DumpError(`unknown argument: ${argv[i]}`);
  }
  if (!result.dir) throw new DumpError('--dir is required');
  if (!result.dbUrl) throw new DumpError('--db-url or RESTORE_DB_URL is required');
  return result;
}

function psql(dbUrl, args) {
  const result = spawnSync('psql', ['--dbname', dbUrl, ...args], { encoding: 'utf8' });
  if (result.error) throw new DumpError('psql is required on PATH for the restore drill');
  if (result.status !== 0) {
    throw new DumpError(
      `psql exited ${result.status}: ${(result.stderr || '').trim().slice(-2000)}`
    );
  }
  return result.stdout;
}

function expectedCounts(dir) {
  const manifestPath = join(dir, 'manifest.json');
  if (existsSync(manifestPath)) {
    return JSON.parse(readFileSync(manifestPath, 'utf8')).counts;
  }
  const parsed = new Map([
    ...parseCopyRowCounts(readFileSync(join(dir, 'data.sql'), 'utf8')),
    ...parseCopyRowCounts(readFileSync(join(dir, 'history_data.sql'), 'utf8')),
  ]);
  return Object.fromEntries(
    Object.keys(TABLE_FLOORS).map((table) => [table, parsed.get(table) ?? null])
  );
}

function quoted(table) {
  return table
    .split('.')
    .map((part) => `"${part.replace(/"/g, '""')}"`)
    .join('.');
}

export function restoredCounts(dbUrl, tables) {
  const actual = {};
  for (const table of tables) {
    const output = psql(dbUrl, [
      '--no-align',
      '--tuples-only',
      '-c',
      `select count(*) from ${quoted(table)}`,
    ]);
    const value = Number.parseInt(output.trim(), 10);
    if (!Number.isFinite(value))
      throw new DumpError(`${table}: psql returned no count: ${output.trim()}`);
    actual[table] = value;
  }
  return actual;
}

/**
 * Empties the scratch project of everything the artifact owns.
 *
 * Only the schemas the artifact creates are dropped, because `auth`, `storage`
 * and their siblings belong to Supabase's admin roles and cannot be dropped
 * from the role the drill connects as (`must be owner of schema auth`, #1954).
 * Their tables are truncated during the replay instead, once `schema.sql` has
 * created the ones that were missing.
 */
export function resetScratch(dir, dbUrl) {
  const schemas = schemasToReset({
    schemaSql: readFileSync(join(dir, 'schema.sql'), 'utf8'),
    historySchemaSql: readFileSync(join(dir, 'history_schema.sql'), 'utf8'),
  });
  const roles = rolesInDump(readFileSync(join(dir, 'roles.sql'), 'utf8'));

  psql(dbUrl, [
    '--single-transaction',
    '--variable',
    'ON_ERROR_STOP=1',
    '--command',
    resetScratchSql(schemas, roles),
  ]);

  const remaining = Number.parseInt(
    psql(dbUrl, ['--no-align', '--tuples-only', '--command', remainingTablesSql(schemas)]).trim(),
    10
  );
  if (remaining !== 0) {
    throw new DumpError(
      `scratch project still holds ${remaining} table(s) in ${schemas.join(', ')} after the reset; refusing to replay onto a dirty database`
    );
  }

  return schemas;
}

/** Platform-owned tables the replay fills: truncated, never dropped. */
export function tablesToEmpty(dir, ownedSchemas) {
  return tablesInDump({
    dataSql: readFileSync(join(dir, 'data.sql'), 'utf8'),
    historyDataSql: readFileSync(join(dir, 'history_data.sql'), 'utf8'),
  }).filter((table) => !ownedSchemas.includes(table.split('.')[0]));
}

export function restoreDump(dir, dbUrl) {
  const expected = expectedCounts(dir);
  const startedAt = Date.now();
  const truncate = truncateTablesSql(
    tablesToEmpty(
      dir,
      schemasToReset({
        schemaSql: readFileSync(join(dir, 'schema.sql'), 'utf8'),
        historySchemaSql: readFileSync(join(dir, 'history_schema.sql'), 'utf8'),
      })
    )
  );

  psql(dbUrl, [
    '--single-transaction',
    '--variable',
    'ON_ERROR_STOP=1',
    '--file',
    join(dir, 'roles.sql'),
    '--file',
    join(dir, 'schema.sql'),
    ...(truncate ? ['--command', truncate] : []),
    '--command',
    'SET session_replication_role = replica',
    '--file',
    join(dir, 'data.sql'),
  ]);

  psql(dbUrl, [
    '--single-transaction',
    '--variable',
    'ON_ERROR_STOP=1',
    '--file',
    join(dir, 'history_schema.sql'),
    '--file',
    join(dir, 'history_data.sql'),
  ]);

  const actual = restoredCounts(dbUrl, Object.keys(expected));
  const problems = [
    ...countMismatches(actual, expected),
    ...floorViolations(actual).map((line) => `floor: ${line}`),
  ];
  if (problems.length) throw new DumpError(problems.join('\n'));

  return { actual, durationSeconds: Math.round((Date.now() - startedAt) / 1000) };
}

function main() {
  let opts;
  try {
    opts = options(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  try {
    const dir = resolve(opts.dir);
    const schemas = resetScratch(dir, opts.dbUrl);
    console.log(`Reset ${schemas.length} schema(s): ${schemas.join(', ')}`);
    const result = restoreDump(dir, opts.dbUrl);
    console.log(`Restore drill passed in ${result.durationSeconds}s`);
    for (const [table, count] of Object.entries(result.actual))
      console.log(`- ${table}: ${count} rows`);
  } catch (error) {
    console.error(`Restore drill failed:\n${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) {
  main();
}
