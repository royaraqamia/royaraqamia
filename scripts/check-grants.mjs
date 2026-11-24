#!/usr/bin/env node
/**
 * Keeps the Postgres privilege boundary a generated, checked artifact (issue
 * #1823). `security/grant-baseline.json` is the committed record of what the
 * two Data API roles may reach in `public`; this script reads the live ACL
 * through the Management API's read-only query endpoint and fails when they
 * disagree. `docs/security.md:62-68` is the prose form of the same claim.
 *
 * Two details keep it usable on a pull request:
 *
 *   - a pending migration's GRANTs and REVOKEs are simulated before the
 *     comparison. The integration applies migrations after the merge
 *     (ADR-0041), so a pull request that moves the boundary would otherwise be
 *     checked against the pre-merge ACL. Simulating both directions makes a
 *     widening fail at once unless the baseline is regenerated in the same
 *     pull request, while a tightening passes until it lands.
 *   - `--from <file>` reads a captured `{ versions, grants }` snapshot, where
 *     `versions` is the pending migration list, for an operator whose region
 *     cannot reach api.supabase.com. The CI run always reads the live project.
 *
 * Usage:
 *   node scripts/check-grants.mjs                 # --check against the project
 *   node scripts/check-grants.mjs --generate      # rewrite the baseline
 *   node scripts/check-grants.mjs --from file.json --generate
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchRemoteVersions, localMigrations, MIGRATIONS_DIR } from './check-migration-drift.mjs';
import { statements } from './check-migration-safety.mjs';

const PROJECT_ROOT = process.cwd();
const API_ROOT = 'https://api.supabase.com/v1/projects';

export const BASELINE_PATH = resolve(PROJECT_ROOT, 'security/grant-baseline.json');
export const ROLES = ['anon', 'authenticated'];

/** The privileges docs/security.md says the public roles never hold. */
export const FORBIDDEN = {
  anon: ['DELETE', 'INSERT', 'UPDATE'],
  authenticated: [],
};
export const FORBIDDEN_TO_BOTH = ['MAINTAIN', 'REFERENCES', 'TRIGGER', 'TRUNCATE'];

/**
 * One row per (relation, role). The read-only endpoint runs as
 * `supabase_read_only_user`, for whom information_schema.role_table_grants
 * hides every public row, so the same ACL is read from pg_catalog.relacl with
 * aclexplode (tables, partitioned/foreign tables and views — not sequences).
 */
export const GRANTS_QUERY = `select c.relname as relation, r.rolname as grantee,
       array_agg(p.privilege_type order by p.privilege_type) as privileges
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
cross join lateral pg_catalog.aclexplode(c.relacl)
  as p(grantor_oid, grantee_oid, privilege_type, is_grantable)
join pg_catalog.pg_authid r on r.oid = p.grantee_oid
where n.nspname = 'public' and c.relkind in ('r', 'p', 'f', 'v', 'm')
  and r.rolname in ('anon', 'authenticated')
group by c.relname, r.rolname
order by c.relname, r.rolname`;

const PRIVILEGES = new Set([
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRUNCATE',
  'REFERENCES',
  'TRIGGER',
  'MAINTAIN',
  'ALL',
]);

/** Accept the endpoint's array, and the `{ data: [...] }` envelope it may use. */
export function normalizeRows(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.result)
        ? payload.result
        : null;
  if (rows === null) throw new Error('the read-only query did not return a row array');

  return rows
    .map((row) => {
      const relation = row?.relation ?? row?.table_name ?? row?.table;
      const grantee = row?.grantee;
      const raw = row?.privileges;
      const privileges = Array.isArray(raw)
        ? raw
        : String(raw ?? '')
            .split(',')
            .map((part) => part.trim());
      return {
        relation: String(relation ?? '').toLowerCase(),
        grantee: String(grantee ?? '').toLowerCase(),
        privileges: privileges
          .map((part) => String(part).trim().toUpperCase())
          .filter((part) => PRIVILEGES.has(part)),
      };
    })
    .filter((row) => row.relation && ROLES.includes(row.grantee) && row.privileges.length > 0)
    .sort((a, b) => a.relation.localeCompare(b.relation) || a.grantee.localeCompare(b.grantee));
}

/** Relation -> role -> sorted privileges, the shape of the baseline. */
export function grantMap(rows) {
  const map = {};
  for (const row of rows) {
    map[row.relation] ??= { anon: [], authenticated: [] };
    for (const privilege of row.privileges) {
      if (!map[row.relation][row.grantee].includes(privilege)) {
        map[row.relation][row.grantee].push(privilege);
      }
    }
  }
  for (const roles of Object.values(map)) {
    for (const role of ROLES) roles[role].sort();
  }
  return Object.fromEntries(
    Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([relation, roles]) => [
        relation,
        { anon: roles.anon, authenticated: roles.authenticated },
      ])
  );
}

export function buildBaseline(rows) {
  return {
    version: 1,
    source: 'information_schema.role_table_grants',
    schema: 'public',
    relations: grantMap(rows),
  };
}

/** Prettier keeps short arrays on one line; emit that shape so regeneration is stable. */
export function serializeBaseline(baseline) {
  const relations = Object.entries(baseline.relations);
  const body = relations
    .map(
      ([relation, roles], index) =>
        `    ${JSON.stringify(relation)}: {\n` +
        `      "anon": [${roles.anon.map(JSON.stringify).join(', ')}],\n` +
        `      "authenticated": [${roles.authenticated.map(JSON.stringify).join(', ')}]\n` +
        `    }${index === relations.length - 1 ? '' : ','}\n`
    )
    .join('');
  return (
    '{\n' +
    `  "version": ${baseline.version},\n` +
    `  "source": ${JSON.stringify(baseline.source)},\n` +
    `  "schema": ${JSON.stringify(baseline.schema)},\n` +
    '  "relations": {\n' +
    body +
    '  }\n' +
    '}\n'
  );
}

/**
 * The GRANT/REVOKEs in migrations the project has not recorded yet. Both
 * directions are simulated: a revocation would otherwise fail the pull request
 * until it landed, and a widening would escape the check until after the merge.
 * Only relation privileges for the two public roles are read — function
 * EXECUTE, schema USAGE and `alter default privileges` are not this baseline.
 */
export function pendingChanges(files, readFile = readFileSync) {
  const changes = [];
  for (const file of files) {
    let sql;
    try {
      sql = readFile(file, 'utf8');
    } catch {
      continue;
    }
    for (const statement of statements(sql)) {
      const match =
        /^(revoke|grant)\s+([\w\s,]+?)\s+on\s+(?:table\s+)?([\w\s,".]+?)\s+(from|to)\s+([\w\s,]+)$/i.exec(
          statement
        );
      if (!match) continue;

      const privileges = match[2]
        .split(',')
        .map((part) => part.trim().toUpperCase())
        .filter((part) => PRIVILEGES.has(part));
      const relations = match[3]
        .split(',')
        .map((part) => part.trim().replace(/"/g, '').split('.').pop().toLowerCase())
        .filter(Boolean);
      const roles = match[5]
        .split(',')
        .map((part) => part.trim().toLowerCase())
        .filter((role) => ROLES.includes(role));
      if (privileges.length > 0 && relations.length > 0 && roles.length > 0) {
        changes.push({
          file,
          kind: match[1].toLowerCase(),
          privileges,
          relations,
          roles,
        });
      }
    }
  }
  return changes;
}

/** Apply the pending statements to a live snapshot so a pull request can be checked. */
export function applyPendingChanges(rows, changes) {
  const map = new Map(
    rows.map((row) => [
      `${row.relation}\0${row.grantee}`,
      { ...row, privileges: [...row.privileges] },
    ])
  );
  for (const change of changes) {
    for (const relation of change.relations) {
      for (const role of change.roles) {
        const key = `${relation}\0${role}`;
        const row = map.get(key) ?? { relation, grantee: role, privileges: [] };
        for (const privilege of change.privileges) {
          if (privilege === 'ALL') continue;
          if (change.kind === 'revoke') {
            row.privileges = row.privileges.filter((item) => item !== privilege);
          } else if (!row.privileges.includes(privilege)) {
            row.privileges.push(privilege);
          }
        }
        map.set(key, row);
      }
    }
  }
  return [...map.values()]
    .map((row) => ({ ...row, privileges: row.privileges.sort() }))
    .filter((row) => row.privileges.length > 0)
    .sort((a, b) => a.relation.localeCompare(b.relation) || a.grantee.localeCompare(b.grantee));
}

function forbiddenFindings(map, label) {
  const findings = [];
  for (const [relation, roles] of Object.entries(map)) {
    for (const role of ROLES) {
      for (const privilege of roles[role] ?? []) {
        if (FORBIDDEN_TO_BOTH.includes(privilege) || FORBIDDEN[role].includes(privilege)) {
          findings.push(
            `${relation}: ${role} holds ${privilege} ${label} — docs/security.md:62-68 forbids it`
          );
        }
      }
    }
  }
  return findings;
}

/** Exact equality: a stale baseline fails in either direction. */
export function compare(baseline, liveRows) {
  const live = grantMap(liveRows);
  const wanted = baseline?.relations ?? {};
  const findings = new Set();
  const relations = new Set([...Object.keys(wanted), ...Object.keys(live)]);

  for (const relation of [...relations].sort()) {
    const expected = wanted[relation];
    const actual = live[relation];
    if (!expected) {
      findings.add(`${relation}: relation holds grants but has no baseline row — regenerate`);
      continue;
    }
    if (!actual) {
      findings.add(`${relation}: baseline row is missing from the database — regenerate`);
      continue;
    }
    for (const role of ROLES) {
      const have = actual[role] ?? [];
      const want = expected[role] ?? [];
      for (const privilege of have.filter((item) => !want.includes(item))) {
        findings.add(`${relation}: unbaselined ${role} grant ${privilege} — regenerate or revoke`);
      }
      for (const privilege of want.filter((item) => !have.includes(item))) {
        findings.add(
          `${relation}: baseline ${role} grant ${privilege} is not in the database — regenerate`
        );
      }
    }
  }

  for (const finding of forbiddenFindings(live, 'in the database')) findings.add(finding);
  for (const finding of forbiddenFindings(wanted, 'in the baseline')) findings.add(finding);
  return [...findings].sort();
}

export async function fetchGrants({ token, projectRef, fetchImpl = fetch }) {
  const response = await fetchImpl(`${API_ROOT}/${projectRef}/database/query/read-only`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query: GRANTS_QUERY, parameters: [] }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `${response.status} ${response.statusText} — ${body.slice(0, 300).replace(/\s+/g, ' ')}`
    );
  }
  return normalizeRows(await response.json());
}

export async function pendingVersions({
  token,
  projectRef,
  fetchImpl = fetch,
  dir = MIGRATIONS_DIR,
}) {
  const remote = new Set(await fetchRemoteVersions({ token, projectRef, fetchImpl }));
  return localMigrations(dir)
    .map((migration) => migration.version)
    .filter((version) => !remote.has(version));
}

export async function main(argv = process.argv.slice(2), options = {}) {
  const {
    env = process.env,
    fetchImpl = fetch,
    log = console.log,
    dir = MIGRATIONS_DIR,
    baselinePath = BASELINE_PATH,
  } = options;

  let generate = false;
  let from = null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--generate') generate = true;
    else if (argv[index] === '--check') generate = false;
    else if (argv[index] === '--from') from = argv[++index];
    else {
      log(`Unknown argument: ${argv[index]}`);
      return 1;
    }
  }

  const token = env.SUPABASE_ACCESS_TOKEN;
  const projectRef = env.SUPABASE_PROJECT_REF;
  let rows;
  let pending = [];

  if (from) {
    try {
      const snapshot = JSON.parse(readFileSync(from, 'utf8'));
      rows = normalizeRows(snapshot.grants ?? snapshot.rows ?? snapshot);
      pending = Array.isArray(snapshot.versions) ? snapshot.versions : [];
    } catch (error) {
      log(`ERROR: could not read the captured grant snapshot: ${error.message}`);
      return 1;
    }
  } else {
    if (!token || !projectRef) {
      log(
        'SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF are not set, so there is no live ACL to ' +
          'compare (fork pull requests do not receive repository secrets). Skipping.'
      );
      return 0;
    }
    try {
      [rows, pending] = await Promise.all([
        fetchGrants({ token, projectRef, fetchImpl }),
        pendingVersions({ token, projectRef, fetchImpl, dir }),
      ]);
    } catch (error) {
      log(`ERROR: could not read the linked project's grants: ${error.message}`);
      return 1;
    }
  }

  const files = new Map(
    localMigrations(dir).map((migration) => [migration.version, resolve(dir, migration.file)])
  );
  const changes = pendingChanges(
    pending.map((version) => files.get(version)).filter((file) => typeof file === 'string')
  );
  const simulated = applyPendingChanges(rows, changes);

  if (generate) {
    writeFileSync(baselinePath, serializeBaseline(buildBaseline(simulated)));
    log(
      `Wrote ${baselinePath} from ${rows.length} live grant rows` +
        ` (${changes.length} pending grant statement(s) simulated).`
    );
    return 0;
  }

  let baseline;
  try {
    baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  } catch (error) {
    log(`ERROR: could not read ${baselinePath}: ${error.message}`);
    return 1;
  }

  const findings = compare(baseline, simulated);
  if (findings.length > 0) {
    log(`${findings.length} grant difference(s) against ${baselinePath}:`);
    for (const finding of findings) log(`  - ${finding}`);
    log('');
    log(
      'The grant layer is the outer wall of docs/security.md. Regenerate with' +
        ' `npm run grants:generate` in the change that moves it.'
    );
    return 1;
  }

  log(
    `Live grants match ${baselinePath} (${Object.keys(baseline.relations ?? {}).length} relations,` +
      ` ${pending.length} pending migration(s) simulated).`
  );
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().then((code) => {
    process.exitCode = code;
  });
}
