#!/usr/bin/env node
/**
 * Vets the migrations a pull request adds or edits for the one thing Supabase
 * made mandatory on 2026-10-30: an explicit `grant` on every new object in
 * `public`.
 *
 * Until then, a table, view or sequence created in `public` reached the Data API
 * automatically because the platform's default privileges granted `anon`,
 * `authenticated` and `service_role` on it. That default is gone for anything
 * created from now on, so a migration that creates an object without its own
 * grant applies cleanly and then answers every request with
 * `42501 permission denied` — including requests through the service-role client,
 * which bypasses RLS but not privileges.
 *
 * This runs on the pull request, where `check-migration-safety.mjs` cannot: that
 * one needs the management API and only vets what is still pending, so a missing
 * grant would otherwise surface after the merge. It reads files; it never talks
 * to the project and needs no credentials.
 *
 * Usage:
 *   node scripts/check-migration-grants.mjs            # changed vs origin/main
 *   node scripts/check-migration-grants.mjs --base <rev>
 *   node scripts/check-migration-grants.mjs <file.sql>...
 */

import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

import { findMissingGrants, grantRemedy } from './check-migration-safety.mjs';

const MIGRATIONS = 'supabase/migrations';

function changedMigrations(base) {
  const output = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=AM', `${base}...HEAD`, '--', MIGRATIONS],
    { encoding: 'utf8' }
  );
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function vet(files, readFile = readFileSync, log = console.log) {
  const findings = [];

  if (files.length === 0) {
    log('No migrations to vet.');
    return 0;
  }

  for (const file of files) {
    let sql;
    try {
      sql = readFile(file, 'utf8');
    } catch {
      continue; // Deleted or renamed out of the diff.
    }
    for (const finding of findMissingGrants(sql)) findings.push({ file, ...finding });
  }

  if (findings.length === 0) {
    log('Every new public table, view and sequence in this change has a grant.');
    return 0;
  }

  log(`${findings.length} new public object(s) have no explicit grant:`);
  for (const finding of findings) {
    log(`  - ${finding.file}: ${finding.name} (${finding.kind})`);
    log(`      ${grantRemedy(finding)}`);
  }
  log('');
  log('Since 2026-10-30 Supabase grants the Data API roles on new public objects only through an');
  log('explicit grant, and `service_role` needs one too: it bypasses row level security, not');
  log('privileges. Add the grant to the same migration.');
  log('See docs/supabase.md ("New public objects need explicit grants").');
  return 1;
}

export function main(argv = process.argv.slice(2)) {
  let base = 'origin/main';
  const files = [];

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--base') {
      base = argv[index + 1] ?? base;
      index += 1;
    } else {
      files.push(argv[index]);
    }
  }

  let targets = files;
  if (targets.length === 0) {
    try {
      targets = changedMigrations(base);
    } catch (error) {
      console.log(
        `ERROR: could not diff against ${base}, so there is nothing to vet: ${error.message}`
      );
      console.log('Fetch the base branch, or pass --base <rev> / explicit migration files.');
      return 1;
    }
  }

  if (targets.length === 0) {
    console.log(`No migrations changed against ${base}. Nothing to vet.`);
    return 0;
  }

  return vet(targets.map((file) => resolve(file)));
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  process.exitCode = main();
}
