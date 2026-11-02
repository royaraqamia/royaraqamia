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
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

import { findMissingGrants, grantRemedy, statements } from './check-migration-safety.mjs';

const MIGRATIONS = 'supabase/migrations';

/** `private.<fn>` / `public.<fn>` a policy expression calls, deduplicated. */
export function policyHelpers(sql) {
  const names = new Set();

  for (const statement of statements(sql)) {
    if (!/^create policy\b/i.test(statement)) continue;
    for (const match of statement.matchAll(/\b(private|public)\.([a-z_][\w$]*)\s*\(/gi)) {
      names.add(`${match[1]}.${match[2]}`);
    }
  }

  return [...names];
}

/** The helpers some migration grants EXECUTE on to `authenticated`. */
export function grantedHelpers(sql) {
  const names = new Set();

  for (const statement of statements(sql)) {
    if (!/^grant\s+execute\s+on\s+function\b/i.test(statement)) continue;
    if (!/\bto\b[\s\S]*\bauthenticated\b/i.test(statement)) continue;

    const match = /\b(private|public)\.([a-z_][\w$]*)\s*\(/i.exec(statement);
    if (match) names.add(`${match[1]}.${match[2]}`);
  }

  return names;
}

/** Every migration's SQL, concatenated: a grant may live in an earlier file. */
export function migrationCorpus(readFile = readFileSync, dir = MIGRATIONS) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFile(resolve(dir, name), 'utf8'))
    .join('\n;\n');
}

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

export function vet(files, readFile = readFileSync, log = console.log, corpus = null) {
  const findings = [];
  const ungranted = [];

  if (files.length === 0) {
    log('No migrations to vet.');
    return 0;
  }

  const granted = corpus === null ? null : grantedHelpers(corpus);

  for (const file of files) {
    let sql;
    try {
      sql = readFile(file, 'utf8');
    } catch {
      continue; // Deleted or renamed out of the diff.
    }
    for (const finding of findMissingGrants(sql)) findings.push({ file, ...finding });

    // A policy evaluates as the caller, not as the table owner: a helper it
    // names must be executable by `authenticated` or the policy answers 42501
    // on every read and write it guards.
    if (granted !== null) {
      for (const helper of policyHelpers(sql)) {
        if (!granted.has(helper)) ungranted.push({ file, helper });
      }
    }
  }

  if (findings.length > 0) {
    log(`${findings.length} new public object(s) have no explicit grant:`);
    for (const finding of findings) {
      log(`  - ${finding.file}: ${finding.name} (${finding.kind})`);
      log(`      ${grantRemedy(finding)}`);
    }
    log('');
    log(
      'Since 2026-10-30 Supabase grants the Data API roles on new public objects only through an'
    );
    log('explicit grant, and `service_role` needs one too: it bypasses row level security, not');
    log('privileges. Add the grant to the same migration.');
    log('See docs/supabase.md ("New public objects need explicit grants").');
  }

  if (ungranted.length > 0) {
    log(`${ungranted.length} policy helper(s) have no EXECUTE grant for authenticated:`);
    for (const finding of ungranted) {
      log(`  - ${finding.file}: ${finding.helper}(...)`);
    }
    log('');
    log('A row level security policy runs its expression as the caller, so a helper it calls');
    log('needs `grant execute ... to authenticated` in some migration. Without it the policy');
    log('answers `42501 permission denied for function ...` and every read and write it guards');
    log('fails — the #811 / #871 regression. Add the grant beside the policy.');
  }

  if (findings.length === 0 && ungranted.length === 0) {
    log('Every new public table, view and sequence in this change has a grant.');
    return 0;
  }

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

  let corpus = null;
  try {
    corpus = migrationCorpus();
  } catch {
    // Without the history the policy-helper rule cannot be answered; the
    // public-object rule still runs.
    corpus = null;
  }

  return vet(
    targets.map((file) => resolve(file)),
    readFileSync,
    console.log,
    corpus
  );
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  process.exitCode = main();
}
