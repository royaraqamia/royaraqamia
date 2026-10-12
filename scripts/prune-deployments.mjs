#!/usr/bin/env node
/**
 * Prunes retained Vercel deployments.
 *
 * Why this exists: Vercel Hobby measures **Deployment Storage** and **Functions
 * Storage** as sums over *all retained deployments* of a project, with 10 GB each
 * and no overage. A repository that pushes ~20 commits/day (plus a release commit
 * per release) reaches hundreds of retained deployments in a month, and the two
 * storage meters climb even when the site is idle. Deleting old deployments is
 * the only lever that shrinks them.
 *
 * This never touches the deployments you would actually need to roll back to:
 * the newest production deployment, anything Vercel still flags as a rollback
 * candidate, and anything younger than `--min-age-days`.
 *
 * Usage:
 *   node scripts/prune-deployments.mjs --dry-run
 *   node scripts/prune-deployments.mjs --keep=25 --min-age-days=1
 *
 * Required env (or flags): VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_ORG_ID
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.vercel.com';
const PAGE_SIZE = 100;
/**
 * 60 deployments ≈ 1.3 GB of Functions Storage (≈21 MB per deployment, measured
 * as 7.06 GB over 325 retained) — about 13% of the Hobby 10 GB cap — while still
 * leaving ~3 days of rollback history at this repository's ~20 deployments/day.
 * The point is to keep both storage meters flat, not to minimise the number.
 */
const DEFAULT_KEEP = 60;
const DEFAULT_MIN_AGE_DAYS = 1;
const DEFAULT_MAX_DELETE = 400;

export function parseArgs(argv) {
  const flags = { 'dry-run': false };
  for (const arg of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (!match) continue;
    const [, name, value] = match;
    flags[name] = value === undefined ? true : value;
  }
  return flags;
}

function numberFlag(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function api(path, { token, method = 'GET' }) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { ok: response.ok, status: response.status, body };
}

/** Walks the deployment list newest-first, `until`-cursored, until exhausted. */
async function listDeployments({ token, projectId, teamId, maxPages = 40 }) {
  const all = [];
  let until = Date.now();
  for (let page = 0; page < maxPages; page++) {
    const query = new URLSearchParams({
      projectId,
      teamId,
      limit: String(PAGE_SIZE),
      until: String(until),
    });
    const { ok, status, body } = await api(`/v6/deployments?${query}`, { token });
    if (!ok) throw new Error(`List deployments failed (${status}): ${JSON.stringify(body)}`);

    const deployments = body?.deployments ?? [];
    if (deployments.length === 0) break;
    all.push(...deployments);

    const next = body?.pagination?.next;
    if (!next || next >= until) break;
    until = next;
  }
  return all;
}

/**
 * Keeps the newest `keep` deployments plus every deployment that must survive a
 * prune, and returns the rest oldest-first.
 */
export function selectForDeletion({ deployments, keep, minAgeMs, now }) {
  const newestFirst = [...deployments].sort((a, b) => b.created - a.created);
  const kept = new Set();

  newestFirst.slice(0, keep).forEach((deployment) => kept.add(deployment.uid ?? deployment.id));

  for (const deployment of newestFirst) {
    const id = deployment.uid ?? deployment.id;
    if (deployment.rollbackCandidate) kept.add(id);
    if (now - deployment.created < minAgeMs) kept.add(id);
  }

  const newestProduction = newestFirst.find((deployment) => deployment.target === 'production');
  if (newestProduction) kept.add(newestProduction.uid ?? newestProduction.id);

  return {
    kept: [...kept],
    deletable: newestFirst
      .filter((deployment) => !kept.has(deployment.uid ?? deployment.id))
      .sort((a, b) => a.created - b.created),
  };
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const token = process.env.VERCEL_TOKEN;
  const projectId = flags.project ?? process.env.VERCEL_PROJECT_ID;
  const teamId = flags.team ?? process.env.VERCEL_ORG_ID;
  const dryRun = Boolean(flags['dry-run']);
  const keep = numberFlag(flags.keep, DEFAULT_KEEP);
  const maxDelete = numberFlag(flags['max-delete'], DEFAULT_MAX_DELETE);
  const minAgeDays = numberFlag(flags['min-age-days'], DEFAULT_MIN_AGE_DAYS);

  if (!token || !projectId || !teamId) {
    console.error('Missing VERCEL_TOKEN, VERCEL_PROJECT_ID or VERCEL_ORG_ID.');
    process.exit(2);
  }

  const deployments = await listDeployments({ token, projectId, teamId });
  const { deletable } = selectForDeletion({
    deployments,
    keep,
    minAgeMs: minAgeDays * 24 * 60 * 60 * 1000,
    now: Date.now(),
  });

  const batch = deletable.slice(0, maxDelete);
  console.log(
    `Retained deployments: ${deployments.length}. Keep: ${keep} (+ rollback candidates, ` +
      `anything younger than ${minAgeDays}d, newest production). Deleting: ${batch.length}` +
      `${deletable.length > batch.length ? ` of ${deletable.length} (capped by --max-delete)` : ''}.`
  );

  if (dryRun) {
    for (const deployment of batch) {
      console.log(
        `  [dry-run] would delete ${deployment.uid ?? deployment.id} (${deployment.url})`
      );
    }
    console.log('Dry run: nothing deleted.');
    return;
  }

  let deleted = 0;
  let failed = 0;
  for (const deployment of batch) {
    const id = deployment.uid ?? deployment.id;
    const query = new URLSearchParams({ teamId });
    const { ok, status, body } = await api(`/v13/deployments/${id}?${query}`, {
      token,
      method: 'DELETE',
    });
    if (ok) {
      deleted++;
      console.log(`  deleted ${id} (${deployment.url ?? 'no url'})`);
    } else {
      failed++;
      console.log(`  failed  ${id} (${status}): ${JSON.stringify(body)?.slice(0, 200)}`);
    }
  }

  console.log(`Deleted ${deleted} deployment(s); ${failed} failed.`);
  // A prune that deletes nothing because the API changed should be visible.
  if (!dryRun && deleted === 0 && batch.length > 0) process.exit(1);
}

/**
 * Anchored to this file's own path, the same way `compute-version.mjs` does it,
 * so the test suite can import `selectForDeletion` without hitting the API.
 */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
