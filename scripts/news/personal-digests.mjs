#!/usr/bin/env node
/**
 * Prepares one prompt per reader who asked for a digest of their own.
 *
 * ADR-0079: the personal digest is the *same* fetched candidate list, narrowed
 * to the sources the reader kept. ADR-0106 adds one thing: the feeds that only
 * this reader holds (`news_user_sources`) are candidates for them and for nobody
 * else, and the shared list never contains them.
 *
 *   node scripts/news/personal-digests.mjs --candidates .news/candidates.json --out .news/personal
 *
 * Output, per reader:
 *   <out>/<user-id>/candidates.json  the narrowed candidate list
 *   <out>/<user-id>/prompt.txt       the editor prompt for that list
 * and one <out>/manifest.json the workflow loops over.
 *
 * A reader with no selection and no private source, or with fewer than
 * MIN_CANDIDATES usable stories, is skipped and named in the summary: publishing
 * a nearly empty digest would be worse than leaving them on the shared one.
 *
 * Rotation (#619): the queue is `last_personal_digest_at nulls first, updated_at
 * asc`, so a reader who has never been served is always ahead of one who has.
 * `updated_at` alone could not do it — it moves only when the reader edits their
 * selection, so with more readers than `--limit` the same oldest rows were
 * picked every night and everyone else was never reached.
 *
 * This script is the **only** writer of that marker, and it stamps every reader
 * it touches — prepared or skipped — as soon as it is handled. Stamping at
 * preparation time rather than after publishing is deliberate: a reader whose
 * model run or publish fails later in the workflow has already moved to the
 * back, so one permanently failing reader cannot hold the head of the queue
 * forever; they are retried on a later night. A stamp that cannot be written is
 * logged and does not fail the run, because the prompts are already prepared and
 * losing the night's digests would cost more than repeating one reader.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { buildPrompt } from './build-prompt.mjs';

const MIN_CANDIDATES = 3;
const TARGET_STORIES = 8;
const MAX_STORIES = 12;
const DEFAULT_LIMIT = 20;
const FETCH_TIMEOUT_MS = 20_000;
/** Set by `markServed`, read by `loadReaders`; never exposed to the client. */
const SERVED_MARKER = 'last_personal_digest_at';

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
 * Readers who opted in, never-served first, then least recently served — with
 * `updated_at` only breaking ties between readers served in the same run, so a
 * busy week still reaches everyone instead of spending every run on the same
 * first twenty.
 *
 * Exported for the test: the ordering is the fix, and it lives in this URL.
 */
export async function loadReaders(config, limit) {
  const endpoint = `${config.url}/rest/v1/news_source_preferences?select=user_id,source_ids,updated_at,${SERVED_MARKER}&personal_enabled=is.true&order=${SERVED_MARKER}.asc.nullsfirst,updated_at.asc&limit=${limit}`;

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
 * Stamps one reader as served, moving them to the back of the rotation.
 *
 * Operational bookkeeping: the digest does not depend on it, so a failed write
 * is the caller's to log rather than a reason to lose the run.
 */
export async function markServed(config, userId, now = new Date()) {
  const response = await fetch(
    `${config.url}/rest/v1/news_source_preferences?user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: config.key,
        authorization: `Bearer ${config.key}`,
        'content-type': 'application/json',
        prefer: 'return=minimal',
      },
      body: JSON.stringify({ [SERVED_MARKER]: now.toISOString() }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }
  );
  if (!response.ok) {
    throw new Error(`marking ${userId} served failed: HTTP ${response.status}`);
  }
}

/**
 * Exported for the test: which candidates a reader's selection leaves, and
 * whether that is enough to ask the model for a digest at all.
 */
export function narrowCandidates(items, sourceIds) {
  const wanted = new Set(sourceIds);
  return items.filter((item) => wanted.has(item.sourceId));
}

/**
 * One reader's candidate list: the shared digest narrowed to what they kept,
 * plus the feeds only they hold (ADR-0106).
 *
 * A reader with no selection means "every shared source", exactly as before. The
 * private items are merged after, deduplicated by URL — a feed that is both in
 * the catalogue and in their own list is one story, and the catalogue's copy is
 * the one every other reader sees.
 */
export function readerCandidates({ shared, privateItems = [], userId, sourceIds }) {
  const selected = sourceIds.length > 0 ? narrowCandidates(shared, sourceIds) : [...shared];
  const seen = new Set(selected.map((item) => item.url));

  for (const item of privateItems) {
    if (item.userId !== userId || seen.has(item.url)) continue;
    seen.add(item.url);
    selected.push(item);
  }

  return selected;
}

export async function preparePersonalDigests({
  readers,
  candidates,
  out,
  limit = DEFAULT_LIMIT,
  log = console.log,
  onServed = async () => {},
}) {
  const users = [];
  const skipped = [];
  const privateItems = Array.isArray(candidates.privateItems) ? candidates.privateItems : [];

  for (const reader of readers.slice(0, limit)) {
    try {
      await prepareOne(reader);
    } finally {
      // Every reader this run touched moves to the back of the rotation, whether
      // it was prepared, skipped, or threw: the next run reaches the readers this
      // one did not, and the head of the queue cannot be held forever (#619).
      await onServed(reader.userId);
    }
  }

  async function prepareOne(reader) {
    const mine = privateItems.filter((item) => item.userId === reader.userId);

    if (reader.sourceIds.length === 0 && mine.length === 0) {
      // "Everything" is the shared digest; a personal one would be a duplicate
      // of it. A reader with a private source is the exception: nothing else
      // would ever show it.
      skipped.push({ userId: reader.userId, reason: 'no selection' });
      return;
    }

    const items = readerCandidates({
      shared: candidates.items,
      privateItems,
      userId: reader.userId,
      sourceIds: reader.sourceIds,
    });
    if (items.length < MIN_CANDIDATES) {
      skipped.push({ userId: reader.userId, reason: `only ${items.length} candidate(s)` });
      return;
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
      sourceCount: reader.sourceIds.length + mine.length,
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
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
    // The stamp is bookkeeping; a failed write is named and the run continues,
    // because the prompts are already on disk and losing the night's digests
    // would cost more than repeating one reader tomorrow.
    onServed: async (userId) => {
      try {
        await markServed(config, userId);
      } catch (error) {
        console.log(`  could not mark ${userId} served: ${errorMessage(error)}`);
      }
    },
  });
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]).endsWith('personal-digests.mjs');

if (invokedDirectly) {
  main().catch((error) => {
    console.error(`personal-digests failed: ${errorMessage(error)}`);
    process.exitCode = 1;
  });
}
