#!/usr/bin/env node
/**
 * Fails when `supabase/migrations/` and the linked project's recorded migration
 * history disagree.
 *
 * Two writers keep those two lists, and nothing compared them:
 *
 *   - a pull request adds a file under `supabase/migrations/`, and `supabase db
 *     push` applies it by hand (README, "Run database migrations");
 *   - the autonomous issue pipeline writes the same SQL to the linked project
 *     through the Supabase MCP `apply_migration` tool, before a human sees the
 *     pull request (`.github/workflows/issue-implementer.yml`).
 *
 * Both directions of disagreement are failures, for different reasons:
 *
 *   - a file the project has no version for: the deploy may reference schema
 *     production does not have (a 500, not a review comment);
 *   - a recorded version the repo has no file for: schema or a policy that
 *     production has, that no review saw and no migration file can roll back.
 *
 * Uses the endpoint the Supabase CLI's `migration list --linked` uses
 * (`GET /v1/projects/{ref}/database/migrations`), so it needs only
 * `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`: no database password, no
 * Docker, no linked working copy. See docs/supabase.md ("Drift check").
 */

import { readdirSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const PROJECT_ROOT = process.cwd();
export const MIGRATIONS_DIR = resolve(PROJECT_ROOT, 'supabase/migrations');
const API_ROOT = 'https://api.supabase.com/v1/projects';

/**
 * Versions the project records that the repo intentionally has no file for.
 * Every entry needs a reason here and a line in docs/supabase.md. Empty: the
 * first run (PR #217, 2026-10-14) found 108 repo files against 108 recorded
 * versions, with nothing one-sided.
 */
export const KNOWN_REMOTE_ONLY = [];

/**
 * Files that are intentionally not applied to the project. Also empty, and also
 * including the base-schema stub (`20260718105449`), which the project does
 * record — the stub is real history, not an asymmetry.
 */
export const KNOWN_LOCAL_ONLY = [];

/** Every `supabase/migrations/*.sql` file, as `{ version, file }`, oldest first. */
export function localMigrations(dir = MIGRATIONS_DIR) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => ({ version: name.split('_')[0], file: name }))
    .sort((a, b) => a.version.localeCompare(b.version));
}

/** The same list as bare versions, for set comparison. */
export function localVersions(dir = MIGRATIONS_DIR) {
  return localMigrations(dir).map((m) => m.version);
}

/**
 * Versions out of a Management API response. Accepts the documented shape
 * (`{ migrations: [{ version, name }] }`) and a bare array, because a shape
 * change here must fail loudly, not quietly compare against nothing.
 */
export function remoteVersions(payload) {
  const rows = Array.isArray(payload) ? payload : (payload?.migrations ?? []);
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => (typeof row === 'string' ? row : row?.version))
    .filter((version) => typeof version === 'string' && version.length > 0)
    .sort();
}

/** The two directions of drift, with the known-intentional entries removed. */
export function diffMigrations(
  local,
  remote,
  { knownLocalOnly = KNOWN_LOCAL_ONLY, knownRemoteOnly = KNOWN_REMOTE_ONLY } = {}
) {
  const remoteSet = new Set(remote);
  const localSet = new Set(local);
  return {
    missingRemotely: local.filter(
      (version) => !remoteSet.has(version) && !knownLocalOnly.includes(version)
    ),
    extraRemotely: remote.filter(
      (version) => !localSet.has(version) && !knownRemoteOnly.includes(version)
    ),
  };
}

export async function fetchRemoteVersions({ token, projectRef, fetchImpl = fetch }) {
  const response = await fetchImpl(`${API_ROOT}/${projectRef}/database/migrations`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `${response.status} ${response.statusText} — ${body.slice(0, 300).replace(/\s+/g, ' ')}`
    );
  }
  return remoteVersions(await response.json());
}

/**
 * Returns the process exit code instead of exiting, so the behaviour is
 * testable: 0 in sync (or nothing to compare against), 1 on drift.
 */
export async function main({
  env = process.env,
  log = console.log,
  fetchImpl = fetch,
  localDir = MIGRATIONS_DIR,
} = {}) {
  const token = env.SUPABASE_ACCESS_TOKEN;
  const projectRef = env.SUPABASE_PROJECT_REF;

  if (!token || !projectRef) {
    log(
      'SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF are not set, so there is nothing to compare ' +
        '(fork pull requests do not receive repository secrets). Skipping.'
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

  if (remote.length === 0) {
    log(
      'ERROR: the linked project reports no recorded migrations at all. Refusing to call that ' +
        '"in sync" — either the project ref is wrong or the API answer changed shape. ' +
        'Inspect it with: supabase migration list --linked'
    );
    return 1;
  }

  const { missingRemotely, extraRemotely } = diffMigrations(
    local.map((m) => m.version),
    remote
  );
  log(`repo files: ${local.length}   project history: ${remote.length}`);

  // A pull request is allowed to be ahead: the migration it adds is applied by
  // main after the merge (docs/supabase.md, "Drift check"). Everything else —
  // main, the schedule, a dispatch — has to be level, and a recorded version the
  // repo has no file for is always a failure, wherever it is seen.
  const strict = (env.MIGRATION_DRIFT_STRICT ?? '1') !== '0';

  if (missingRemotely.length === 0 && extraRemotely.length === 0) {
    log('In sync.');
    return 0;
  }

  if (missingRemotely.length > 0) {
    log('');
    log(
      strict
        ? `${missingRemotely.length} migration(s) the project has not applied — production is behind:`
        : `${missingRemotely.length} migration(s) not applied yet, which main does after the merge:`
    );
    for (const version of missingRemotely) {
      const file = local.find((m) => m.version === version)?.file ?? `${version}_*.sql`;
      log(`  - ${file}`);
    }
    if (strict) log('  Fix: supabase db push (then re-run this check).');
  }

  if (extraRemotely.length > 0) {
    log('');
    log(
      `${extraRemotely.length} recorded migration(s) the repo has no file for — production is ahead:`
    );
    for (const version of extraRemotely) {
      log(`  - ${version}`);
    }
    log(
      '  These were applied out of band (the agent pipeline applies SQL through the Supabase MCP\n' +
        '  apply_migration tool before review). Decide which of the two is right, then either add the\n' +
        '  file the project is missing or revert the record: supabase migration repair --status reverted <version>'
    );
  }

  log('');
  log('See docs/supabase.md ("Drift check").');
  return extraRemotely.length > 0 || strict ? 1 : 0;
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  process.exitCode = await main();
}
