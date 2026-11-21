#!/usr/bin/env node
/**
 * Gate for the scheduled database backup (#1700).
 *
 * A dump that is absent, empty or below the recorded size/row floor is a failed
 * job: this script's exit code is the gate, not a log line someone might read.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DumpError,
  TABLE_FLOORS,
  floorViolations,
  parseCopyRowCounts,
  sizeViolations,
  summaryMarkdown,
} from './backup-contract.mjs';

function options(argv) {
  const result = { dir: null, manifest: null, archive: null, source: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dir') result.dir = argv[++i];
    else if (argv[i] === '--manifest') result.manifest = argv[++i];
    else if (argv[i] === '--archive') result.archive = argv[++i];
    else if (argv[i] === '--source') result.source = argv[++i];
    else throw new DumpError(`unknown argument: ${argv[i]}`);
  }
  if (!result.dir) throw new DumpError('--dir is required');
  return result;
}

export function verifyDump(dir, { archive, source } = {}) {
  const sizes = {};
  for (const file of [
    'roles.sql',
    'schema.sql',
    'data.sql',
    'history_schema.sql',
    'history_data.sql',
  ]) {
    const path = join(dir, file);
    sizes[file] = existsSync(path) ? statSync(path).size : null;
  }

  const badSizes = sizeViolations(sizes);
  if (badSizes.length) throw new DumpError(badSizes.join('\n'));

  const parsed = new Map([
    ...parseCopyRowCounts(readFileSync(join(dir, 'data.sql'), 'utf8')),
    ...parseCopyRowCounts(readFileSync(join(dir, 'history_data.sql'), 'utf8')),
  ]);
  const counts = Object.fromEntries(
    Object.keys(TABLE_FLOORS).map((table) => [table, parsed.get(table) ?? null])
  );
  const badCounts = floorViolations(counts);
  if (badCounts.length) {
    throw new DumpError(`${badCounts.join('\n')}\nFound: ${[...parsed.keys()].join(', ')}`);
  }

  return {
    createdAt: new Date().toISOString(),
    source: source ?? process.env.SUPABASE_PROJECT_REF ?? 'unknown',
    archive: archive ?? null,
    sizes,
    counts,
  };
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

  const dir = resolve(opts.dir);
  try {
    const stats = verifyDump(dir, { archive: opts.archive, source: opts.source });
    console.log(summaryMarkdown(stats));
    if (opts.manifest) writeFileSync(opts.manifest, `${JSON.stringify(stats, null, 2)}\n`);
  } catch (error) {
    console.error(`Database dump verification failed:\n${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) {
  main();
}
