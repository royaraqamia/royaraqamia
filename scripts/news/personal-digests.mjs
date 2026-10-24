#!/usr/bin/env node
/**
 * Prepares one prompt per reader who asked for a digest of their own.
 *
 * ADR-0079: the personal digest is the *same* fetched candidate list, narrowed
 * to the sources the reader kept. Nothing is fetched twice and no new source can
 * appear — the candidate list the daily fetch wrote is the only input, and the
 * validator that gates the shared digest gates this one too.
 *
 *   node scripts/news/personal-digests.mjs --candidates .news/candidates.json --out .news/personal
 *
 * Output, per reader:
 *   <out>/<user-id>/candidates.json  the narrowed candidate list
 *   <out>/<user-id>/prompt.txt       the editor prompt for that list
 * and one <out>/manifest.json the workflow loops over.
 *
 * A reader with no selection, or with fewer than MIN_CANDIDATES usable stories,
 * is skipped and named in the summary: publishing a nearly empty digest would
 * be worse than leaving them on the shared one, and it would still cost a credit.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { buildPrompt } from './build-prompt.mjs';

const MIN_CANDIDATES = 3;
const TARGET_STORIES = 8;
const MAX_STORIES = 12;
const DEFAULT_LIMIT = 20;
const FETCH_TIMEOUT_MS = 20_000;

function parseArgs(argv) {
  const options = {
    candidates: resolve('.news', 'candidates.json'),
    out: resolve('.news', 'personal'),
    limit: DEFAULT_LIMIT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value) continue;
    if (flag === '--candidates') options.candidates = resolve(value);
    else if (flag === '--out') options.out = resolve(value);
    else if (flag === '--limit') options.limit = Math.max(1, Number(value) || DEFAULT_LIMIT);
    else continue;
    index += 1;
  }

  return options;
}

function readConfig(env = process.env) {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  return { url: url.replace(/\/+$/, ''), key };
}

/**
 * Readers who opted in, least recently touched first, so a busy week still
 * reaches everyone instead of spending every run on the same first twenty.
 */
async function loadReaders(config, limit) {
  const endpoint = `${config.url}/rest/v1/news_source_preferences?select=user_id,source_ids,updated_at&personal_enabled=is.true&order=updated_at.asc&limit=${limit}`;

  const response = await fetch(endpoint, {
    headers: { apikey: config.key, authorization: `Bearer ${config.key}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`reading news preferences failed: HTTP ${response.status}`);
  }

  const rows = await response.json();
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    userId: String(row.user_id ?? ''),
    sourceIds: Array.isArray(row.source_ids) ? row.source_ids.map(String) : [],
  }));
}

/**
 * Exported for the test: which candidates a reader's selection leaves, and
 * whether that is enough to ask the model for a digest at all.
 */
export function narrowCandidates(items, sourceIds) {
  const wanted = new Set(sourceIds);
  return items.filter((item) => wanted.has(item.sourceId));
}

export async function preparePersonalDigests({
  readers,
  candidates,
  out,
  limit = DEFAULT_LIMIT,
  log = console.log,
}) {
  const users = [];
  const skipped = [];

  for (const reader of readers.slice(0, limit)) {
    if (reader.sourceIds.length === 0) {
      // "Everything" is the shared digest; a personal one would be a duplicate
      // that costs a credit.
      skipped.push({ userId: reader.userId, reason: 'no selection' });
      continue;
    }

    const items = narrowCandidates(candidates.items, reader.sourceIds);
    if (items.length < MIN_CANDIDATES) {
      skipped.push({ userId: reader.userId, reason: `only ${items.length} candidate(s)` });
      continue;
    }

    const narrowed = { ...candidates, items };
    const prompt = buildPrompt(narrowed, {
      minStories: MIN_CANDIDATES,
      targetStories: TARGET_STORIES,
      maxStories: MAX_STORIES,
      personal: true,
    });

    const directory = join(out, reader.userId);
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, 'candidates.json'),
      `${JSON.stringify(narrowed, null, 2)}\n`,
      'utf8'
    );
    await writeFile(join(directory, 'prompt.txt'), prompt, 'utf8');

    users.push({
      userId: reader.userId,
      candidateCount: items.length,
      sourceCount: reader.sourceIds.length,
      directory,
    });
  }

  const manifest = { digestDate: candidates.digestDate, users, skipped };
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  for (const skip of skipped) log(`  skipped ${skip.userId}: ${skip.reason}`);
  log(`Prepared ${users.length} personal digest prompt(s) for ${candidates.digestDate}`);

  return manifest;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const candidates = JSON.parse(await readFile(options.candidates, 'utf8'));
  if (!Array.isArray(candidates.items) || candidates.items.length === 0) {
    throw new Error(`${options.candidates} has no items`);
  }

  const config = readConfig();
  const readers = await loadReaders(config, options.limit);
  await preparePersonalDigests({
    readers,
    candidates,
    out: resolve(options.out),
    limit: options.limit,
  });
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]).endsWith('personal-digests.mjs');

if (invokedDirectly) {
  main().catch((error) => {
    console.error(`personal-digests failed: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
