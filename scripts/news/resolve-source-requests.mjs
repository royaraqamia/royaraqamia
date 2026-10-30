#!/usr/bin/env node
/**
 * Drains the reader-proposal queue: every `resolving` row gets an answer.
 *
 * The form no longer reads the URL it is given (ADR-0105), so this is where a
 * link becomes a feed, or stops pretending it can be one. A row is written to
 * `ready` with the feed the digest will fetch, or to `needs_review` with the
 * reason — never left `resolving`, and never deleted.
 *
 *   node scripts/news/resolve-source-requests.mjs
 *   node scripts/news/resolve-source-requests.mjs --dry-run --limit 5
 *
 * The write is conditional on the row still being `resolving`, so a second run
 * (or an Admin's decision racing this one) cannot be overwritten.
 *
 * Exit codes: 0 when every claimed row was answered, 1 when the queue could not
 * be read or written — the workflow should alert on that, because a queue nobody
 * drains looks exactly like a queue nobody used.
 */

import { resolve } from 'node:path';

import { resolveSourceUrl } from './resolve-source.mjs';

const DEFAULT_LIMIT = 25;
const BATCH_SIZE = 3;
const REQUEST_TIMEOUT_MS = 20_000;

function parseArgs(argv) {
  const options = { limit: DEFAULT_LIMIT, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--dry-run') {
      options.dryRun = true;
    } else if (flag === '--limit') {
      options.limit = Math.max(1, Number(argv[index + 1]) || DEFAULT_LIMIT);
      index += 1;
    }
  }
  return options;
}

export function readConfig(env = process.env) {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  return { url: url.replace(/\/+$/, ''), key };
}

function headers(config, extra = {}) {
  return {
    apikey: config.key,
    authorization: `Bearer ${config.key}`,
    'content-type': 'application/json',
    ...extra,
  };
}

/** The oldest unresolved rows: a reader who filed first is answered first. */
export async function claimRows(config, limit) {
  const endpoint =
    `${config.url}/rest/v1/news_source_requests` +
    `?select=id,url,name,attempts&status=eq.resolving&order=created_at.asc&limit=${limit}`;

  const response = await fetch(endpoint, {
    headers: headers(config),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`reading the queue failed: HTTP ${response.status}`);

  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

/**
 * Writes one answer. The `status=eq.resolving` filter is the claim: a row an
 * Admin decided, or another run already answered, is left exactly as it is.
 */
export async function writeAnswer(config, id, patch) {
  const endpoint =
    `${config.url}/rest/v1/news_source_requests` +
    `?id=eq.${encodeURIComponent(id)}&status=eq.resolving`;

  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: headers(config, { prefer: 'return=representation' }),
    body: JSON.stringify(patch),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`writing an answer failed: HTTP ${response.status}`);

  const rows = await response.json();
  return Array.isArray(rows) ? rows.length : 0;
}

/** The patch a resolution becomes. One answer per row; the worker never re-asks. */
export function answerFor(row, resolution) {
  const attempts = Number(row?.attempts ?? 0) + 1;

  if (resolution.failure) {
    return {
      status: 'needs_review',
      attempts,
      resolved_at: new Date().toISOString(),
      failure: resolution.failure,
      failure_detail: String(resolution.detail ?? '').slice(0, 500) || null,
    };
  }

  return {
    status: 'ready',
    kind: resolution.kind,
    resolved_url: resolution.url,
    failure: null,
    failure_detail: null,
    resolved_at: new Date().toISOString(),
    attempts,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const config = readConfig();
  const rows = await claimRows(config, options.limit);

  if (rows.length === 0) {
    console.log('No resolving rows.');
    return;
  }

  let answered = 0;
  let failed = 0;

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (row) => ({
        row,
        resolution: await resolveSourceUrl(row.url),
      }))
    );

    for (const { row, resolution } of results) {
      const label = resolution.failure
        ? `needs_review (${resolution.failure}: ${resolution.detail})`
        : `ready → ${resolution.kind} ${resolution.url}`;

      if (options.dryRun) {
        console.log(`  ${row.id} ${row.url} → ${label}`);
        answered += 1;
        continue;
      }

      try {
        const written = await writeAnswer(config, row.id, answerFor(row, resolution));
        if (written === 0) {
          console.log(`  ${row.id} skipped: no longer resolving`);
        } else {
          console.log(`  ${row.id} ${row.name}: ${label}`);
        }
        answered += 1;
      } catch (error) {
        failed += 1;
        console.error(`  ${row.id} could not be written: ${error.message}`);
      }
    }
  }

  console.log(`Answered ${answered} row(s), ${failed} write failure(s).`);
  if (failed > 0) process.exitCode = 1;
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]).endsWith('resolve-source-requests.mjs');

if (invokedDirectly) {
  main().catch((error) => {
    console.error(
      `resolve-source-requests failed: ${error instanceof Error ? error.message : error}`
    );
    process.exitCode = 1;
  });
}
