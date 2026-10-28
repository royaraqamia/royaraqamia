#!/usr/bin/env node
/**
 * Prunes retained Vercel deployments.
 *
 * Why this exists: Vercel Hobby measures **Deployment Storage** and **Functions
 * Storage** as sums over *all retained deployments* of a project, with 10 GB each
 * and no overage. It also rate-limits deployment *creation* to roughly 100 per
 * day. A repository that deploys every branch push (plus a production deployment
 * per merge and per release commit) reaches both limits while the site is idle:
 * on 2026-10-20 the daily creation cap was hit with 91 deployments created by
 * mid-afternoon, and storage climbed to 9.18 GB.
 *
 * `vercel.json` sets `git.deploymentEnabled` to `main` only (`"**": false`; a
 * bare `"*"` stops at `/` and misses `type/name` branches), so branches no
 * longer deploy. Deleting old deployments is the only lever that shrinks the
 * storage meters.
 *
 * This never touches the deployments you would actually need to roll back to:
 * the newest production deployment, anything Vercel still flags as a rollback
 * candidate, and anything younger than `--min-age-days`.
 *
 * Usage:
 *   node scripts/prune-deployments.mjs --dry-run
 *   node scripts/prune-deployments.mjs --keep=25 --min-age-days=0.25
 *
 * Required env (or flags): VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_ORG_ID
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.vercel.com';
const PAGE_SIZE = 100;
/**
 * 25 deployments is ~1.4 GB of Functions Storage at the ~54 MB per deployment
 * measured on 2026-10-20 (9.18 GB over ~170 retained) — around 14% of the Hobby
 * 10 GB cap. With preview deployments off there are ~30 deployments/day, so 25
 * is about a day of rollback history; the current production deployment and any
 * deployment Vercel still flags as a rollback candidate survive regardless.
 * The point is to keep both storage meters flat, not to minimise the number.
 */
const DEFAULT_KEEP = 25;
/**
 * Six hours. The gate exists to avoid deleting a deployment that is still
 * building or that was just handed out as a preview URL — not to preserve a
 * day of history: at ~90 deployments/day the old one-day gate covered the whole
 * retained set, so `keep` could never bind and storage sat at the cap.
 */
const DEFAULT_MIN_AGE_DAYS = 0.25;
/**
 * Vercel rate-limits deployment deletion to roughly 200 per 10 minutes
 * (`429 rate_limited`, code `now-rm`). Stay under it and let the next scheduled
 * run pick up the remainder rather than spraying failures: the daily cron
 * converges within a day or two from any starting point.
 */
const DEFAULT_MAX_DELETE = 180;

/** A `429` from the deployment-deletion endpoint, as opposed to a real failure. */
export function isRateLimited(status, body) {
  return status === 429 || body?.error?.code === 'rate_limited';
}

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
  let paused = false;
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
      continue;
    }
    if (isRateLimited(status, body)) {
      paused = true;
      break;
    }
    failed++;
    console.log(`  failed  ${id} (${status}): ${JSON.stringify(body)?.slice(0, 200)}`);
  }

  const remaining = batch.length - deleted;
  if (paused) {
    console.log(
      `Paused on Vercel's deletion rate limit (~200 per 10 minutes). ${remaining} ` +
        `deployment(s) left; the next scheduled run prunes them.`
    );
  }
  console.log(`Deleted ${deleted} deployment(s); ${failed} failed; ${remaining} deferred.`);
  // A prune that deletes nothing while the API answers must be visible — but a
  // rate-limit pause after real deletions is normal convergence, not a failure.
  if (!dryRun && deleted === 0 && failed > 0) process.exit(1);
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
