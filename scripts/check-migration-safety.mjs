#!/usr/bin/env node
/**
 * Decides whether the migrations a merge left pending may be applied to the
 * linked project without a human, and refuses when they may not.
 *
 * `.github/workflows/migration-drift.yml` runs this before `supabase db push`, so
 * the automation is allowed the migrations docs/supabase.md calls routine, and
 * stops at the ones its "Forbidden without explicit human approval" section
 * names: dropping tables or columns, truncating, turning row level security off,
 * rewriting the Auth or Storage schemas, and unbounded deletes. It also refuses a
 * migration that creates a table, view or sequence in `public` without an
 * explicit `grant`: since 2026-10-30 Supabase no longer grants the Data API roles
 * on new objects, so such a migration applies cleanly and then answers every
 * request with `42501 permission denied`. What it refuses is still just a file in
 * a pull request — a person applies it by hand, with `supabase db push`, after
 * reading it.
 *
 * The matching is statement-accurate on purpose, because the obvious keyword
 * search is wrong on this repo's own migrations:
 *
 *   - a rollback note is a comment: `-- rollback: drop table public.foo;` is not a
 *     drop, and a handful of the 108 migrations carry exactly that line;
 *   - `revoke insert, update, delete, truncate, references, trigger ...` is a
 *     privilege list, not a TRUNCATE — hence anchoring on the statement start;
 *   - `drop policy if exists x; create policy x ...` is the idempotent
 *     redefinition idiom this repo uses everywhere, so a drop whose object the
 *     same file recreates is routine, and one that is not, is not.
 *
 * It reads and compares; it never writes. `check-migration-drift.mjs` owns the
 * readers it shares with the drift gate, so the two can never disagree about
 * what "pending" means.
 */

import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

import { MIGRATIONS_DIR, fetchRemoteVersions, localMigrations } from './check-migration-drift.mjs';

/** Objects whose redefinition in the same file makes a drop routine. */
const DROPPABLE = ['policy', 'function', 'procedure', 'trigger', 'view', 'index', 'type'];

const CREATES = {
  policy: /create\s+policy\s+(?:if\s+not\s+exists\s+)?([\w."]+)/gi,
  function: /create\s+(?:or\s+replace\s+)?function\s+([\w."]+)/gi,
  procedure: /create\s+(?:or\s+replace\s+)?procedure\s+([\w."]+)/gi,
  trigger: /create\s+(?:or\s+replace\s+)?trigger\s+([\w."]+)/gi,
  view: /create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+([\w."]+)/gi,
  index: /create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([\w."]+)/gi,
  type: /create\s+type\s+([\w."]+)/gi,
};

const identifier = (token) => token.replace(/"/g, '').toLowerCase();

/** Every identifier in a statement, with schema-qualified names unqualified too. */
function identifiers(statement) {
  const found = new Set();
  for (const match of statement.matchAll(/"?([A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)*)"?/g)) {
    const name = identifier(match[1]);
    found.add(name);
    const lastSegment = name.split('.').pop();
    if (lastSegment) found.add(lastSegment);
  }
  return found;
}

/** Splits on statement boundaries after removing comments. */
export function statements(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement.length > 0);
}

/**
 * The statements in `sql` that must not run unattended, each with the reason.
 * Returns `[]` for the ordinary case: creates, replaces, adds, enables,
 * comments, and bounded housekeeping deletes.
 */
export function findUnsafeStatements(sql) {
  const parts = statements(sql);
  const whole = parts.join('; ').toLowerCase();

  const recreated = {};
  for (const kind of DROPPABLE) {
    recreated[kind] = new Set(
      [...whole.matchAll(CREATES[kind])].map((match) => identifier(match[1]))
    );
  }

  const findings = [];
  const refuse = (statement, reason) => findings.push({ statement, reason });

  for (const statement of parts) {
    const head = statement.toLowerCase();

    if (/^drop\s+(table|schema)\b/.test(head)) {
      refuse(statement, 'drops a table or a schema');
      continue;
    }

    if (/^truncate\b/.test(head)) {
      refuse(statement, 'truncates a table');
      continue;
    }

    if (/^alter\s+table\b/.test(head) && /\bdrop\s+column\b/.test(head)) {
      refuse(statement, 'drops a column');
      continue;
    }

    if (/\b(?:disable|no\s+force)\s+row\s+level\s+security\b/.test(head)) {
      refuse(statement, 'turns row level security off');
      continue;
    }

    const dropped = /^drop\s+(policy|function|procedure|trigger|view|index|type)\b/.exec(head);
    if (dropped) {
      const kind = dropped[1];
      const redefines = [...identifiers(statement)].some((name) => recreated[kind].has(name));
      if (!redefines) {
        refuse(statement, `drops a ${kind} the same file does not recreate`);
      }
      continue;
    }

    if (/^(?:insert\s+into|update|delete\s+from|alter\s+table)\s+auth\.users\b/.test(head)) {
      refuse(statement, 'writes to auth.users');
      continue;
    }

    if (
      /^(?:insert\s+into|update|delete\s+from|alter\s+table|drop\s+table)\s+storage\.(?:buckets|objects)\b/.test(
        head
      )
    ) {
      refuse(statement, 'changes Storage buckets or objects');
      continue;
    }

    if (/^delete\s+from\b/.test(head) && !/\bwhere\b/.test(head)) {
      refuse(statement, 'deletes rows without a WHERE clause');
      continue;
    }
  }

  return findings;
}

/** New objects whose reachability depends on a grant in the same file. */
const CREATES_PUBLIC = [
  {
    kind: 'table',
    pattern:
      /^create\s+(?:(?:unlogged|temporary|temp|foreign)\s+)?table\s+(?:if\s+not\s+exists\s+)?([\w."]+)/i,
  },
  {
    kind: 'view',
    pattern:
      /^create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?([\w."]+)/i,
  },
  {
    kind: 'sequence',
    pattern: /^create\s+sequence\s+(?:if\s+not\s+exists\s+)?([\w."]+)/i,
  },
];

/** `public.<object>` for a name in `public`, or for an unqualified name. */
function publicName(token) {
  const parts = token.replace(/"/g, '').toLowerCase().split('.');
  if (parts.length === 1) return `public.${parts[0]}`;
  return parts[0] === 'public' && parts.length === 2 ? `${parts[0]}.${parts[1]}` : null;
}

/** The public objects one `grant` statement covers. */
function grantedObjects(statement) {
  const covered = {
    tables: new Set(),
    sequences: new Set(),
    allTables: false,
    allSequences: false,
  };
  const match = /^grant\s+.+?\s+on\s+(.+?)\s+to\s+/is.exec(statement);
  if (!match) return covered;

  let clause = match[1].trim();
  const lower = clause.toLowerCase();

  if (/^all\s+tables\s+in\s+schema\s+public\b/.test(lower)) covered.allTables = true;
  if (/^all\s+sequences\s+in\s+schema\s+public\b/.test(lower)) covered.allSequences = true;
  if (covered.allTables || covered.allSequences) return covered;

  // `all tables in schema private`, functions, types, schemas: not this gate's objects.
  if (/^all\s+(?:tables|sequences|functions|routines|procedures)\b/.test(lower)) return covered;
  if (/^(?:function|procedure|routine|schema|database|type|domain)\b/.test(lower)) return covered;

  const isSequence = /^sequence\s+/.test(lower);
  clause = clause.replace(/^(?:table|sequence)\s+/i, '');

  for (const entry of clause.split(',')) {
    const name = publicName(entry.trim().split(/\s+/)[0] ?? '');
    if (!name) continue;
    if (isSequence) covered.sequences.add(name);
    else covered.tables.add(name);
  }
  return covered;
}

/** The implicit sequences a `serial` column creates, named the way Postgres names them. */
function serialSequences(statement, table) {
  const sequences = [];
  for (const match of statement.matchAll(/([\w"]+)\s+(?:big|small)?serial\b/gi)) {
    sequences.push(`${table}_${match[1].replace(/"/g, '').toLowerCase()}_seq`);
  }
  return sequences;
}

/**
 * The public tables, views and sequences a migration creates without a `grant`
 * of their own in the same file. `service_role` bypasses row level security but
 * not privileges, so a grant is required even for a table only the server reads.
 * Whether a given role should get one is the migration author's decision; this
 * only insists that the decision is written down.
 */
export function findMissingGrants(sql) {
  const parts = statements(sql);
  const covered = {
    tables: new Set(),
    sequences: new Set(),
    allTables: false,
    allSequences: false,
  };

  for (const statement of parts) {
    const granted = grantedObjects(statement);
    for (const table of granted.tables) covered.tables.add(table);
    for (const sequence of granted.sequences) covered.sequences.add(sequence);
    covered.allTables ||= granted.allTables;
    covered.allSequences ||= granted.allSequences;
  }

  const missing = new Map();
  const add = (name, kind) => {
    if (!missing.has(name)) missing.set(name, { name, kind });
  };

  for (const statement of parts) {
    for (const { kind, pattern } of CREATES_PUBLIC) {
      const match = pattern.exec(statement);
      if (!match) continue;

      const name = publicName(match[1]);
      if (!name) continue;

      if (kind === 'sequence') {
        if (!covered.allSequences && !covered.sequences.has(name)) add(name, 'sequence');
        continue;
      }

      if (!covered.allTables && !covered.tables.has(name)) add(name, kind);

      if (kind === 'table') {
        for (const sequence of serialSequences(statement, name)) {
          if (!covered.allSequences && !covered.sequences.has(sequence)) add(sequence, 'sequence');
        }
      }
    }
  }

  return [...missing.values()];
}

/** The grant a missing object most likely wants, shown in the refusal. */
export function grantRemedy({ name, kind }) {
  if (kind === 'sequence') {
    return `grant usage, select on sequence ${name} to authenticated;  -- only the roles that need it`;
  }
  if (kind === 'view') {
    return `grant select on ${name} to authenticated;  -- add anon if it is public, service_role if the server reads it`;
  }
  return `grant select, insert, update, delete on ${name} to authenticated;  -- only the roles that need it, service_role included if the server writes it`;
}

/** The migrations on disk the project has not recorded, oldest first. */
export function pendingMigrations(local, remote) {
  const recorded = new Set(remote);
  return local.filter((migration) => !recorded.has(migration.version));
}

export async function main({
  env = process.env,
  log = console.log,
  fetchImpl = fetch,
  localDir = MIGRATIONS_DIR,
  readFile = readFileSync,
} = {}) {
  const token = env.SUPABASE_ACCESS_TOKEN;
  const projectRef = env.SUPABASE_PROJECT_REF;

  if (!token || !projectRef) {
    log(
      'SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF are not set, so there is nothing to vet. Skipping.'
    );
    return 0;
  }

  const local = localMigrations(localDir);
  let remote;
  try {
    remote = await fetchRemoteVersions({ token, projectRef, fetchImpl });
  } catch (error) {
    log(`ERROR: could not read the linked project's migration history: ${error.message}`);
    return 1;
  }

  const pending = pendingMigrations(local, remote);
  if (pending.length === 0) {
    log('Nothing pending: the project has recorded every file in supabase/migrations.');
    return 0;
  }

  log(`${pending.length} migration(s) pending, oldest first:`);
  for (const migration of pending) log(`  - ${migration.file}`);

  const refused = [];
  const missingGrants = [];
  for (const migration of pending) {
    const sql = readFile(join(localDir, migration.file), 'utf8');
    for (const finding of findUnsafeStatements(sql)) {
      refused.push({ file: migration.file, ...finding });
    }
    for (const finding of findMissingGrants(sql)) {
      missingGrants.push({ file: migration.file, ...finding });
    }
  }

  log('');
  if (refused.length === 0 && missingGrants.length === 0) {
    log(
      'Safe to apply unattended: nothing here drops, truncates, disables row level security, or wipes rows,'
    );
    log('and every new public table, view and sequence carries its own grant.');
    return 0;
  }

  if (refused.length > 0) {
    log(`${refused.length} statement(s) need a human before they run unattended:`);
    for (const finding of refused) {
      log(`  - ${finding.file}: ${finding.reason}`);
      log(`      ${finding.statement.slice(0, 160)}`);
    }
    log('');
  }

  if (missingGrants.length > 0) {
    log(`${missingGrants.length} new public object(s) have no explicit grant:`);
    for (const finding of missingGrants) {
      log(`  - ${finding.file}: ${finding.name} (${finding.kind})`);
      log(`      ${grantRemedy(finding)}`);
    }
    log('');
    log(
      'Since 2026-10-30 Supabase grants the Data API roles on new public objects only through an'
    );
    log('explicit grant, so this migration would apply and then answer 42501.');
    log('Add the grant to the same migration; applying this file as it stands does not fix it.');
    log('');
  }

  if (refused.length > 0) {
    log(
      'Refusing to apply. Read the file, then either replace the statement in a follow-up migration,'
    );
    log('or merge this one and apply it yourself once you have approved it:');
    log('  supabase link --project-ref <ref> && supabase db push');
  } else {
    log('Refusing to apply until the grants are in the migration.');
  }
  log(
    'See docs/supabase.md ("Forbidden without explicit human approval", "New public objects need explicit grants").'
  );
  return 1;
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  process.exitCode = await main();
}
