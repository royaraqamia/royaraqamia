#!/usr/bin/env node
/**
 * Publishes a validated digest to Supabase.
 *
 *   node scripts/news/publish-digest.mjs --digest .news/resolved.json [--dry-run]
 *
 * Uses PostgREST with the service role, not an app route: the workflow has no
 * serverless time limit to respect, and the web app must stay read-only for this
 * table. Writes are ordered so a failure cannot leave a digest that claims
 * stories it does not have:
 *
 *   1. upsert the digest row with `story_count = 0` (a re-run keeps the same day's
 *      row, and its id, instead of failing on the unique date)
 *   2. delete that digest's stories, then insert the resolved ones
 *   3. set `story_count` — the last write also gives Realtime subscribers a
 *      second change, after the stories exist, so a client that refreshed on the
 *      first event still converges
 *
 * A digest already exists for the day? It is replaced. Nothing else is touched.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const options = { digest: resolve('.news', 'resolved.json'), dryRun: false };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--digest') {
      options.digest = resolve(argv[index + 1] ?? options.digest);
      index += 1;
    } else if (flag === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

function readConfig(env = process.env) {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is required');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  return { url: url.replace(/\/+$/, ''), key };
}

function headers(key, extra = {}) {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    ...extra,
  };
}

async function request(url, key, { method = 'GET', body, prefer } = {}) {
  const response = await fetch(url, {
    method,
    headers: headers(key, prefer ? { prefer } : {}),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${url} failed: HTTP ${response.status} ${text.slice(0, 400)}`);
  }

  return text.length > 0 ? JSON.parse(text) : null;
}

export async function publishDigest({ config, digest, dryRun = false, log = console.log }) {
  if (dryRun) {
    log(`[dry-run] would publish ${digest.story_count} stories for ${digest.digest_date}`);
    return { id: null, dryRun: true };
  }

  const base = `${config.url}/rest/v1`;
  const storyRows = digest.stories.map((story) => ({
    position: story.position,
    category: story.category,
    region: story.region,
    headline_ar: story.headline_ar,
    summary_ar: story.summary_ar,
    why_it_matters_ar: story.why_it_matters_ar,
    source_id: story.source_id,
    source_name: story.source_name,
    source_url: story.source_url,
    source_published_at: story.source_published_at,
  }));

  const [saved] = await request(`${base}/news_digests?on_conflict=digest_date`, config.key, {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: [
      {
        digest_date: digest.digest_date,
        title: digest.title,
        lede: digest.lede,
        story_count: 0,
        model: digest.model,
        run_url: digest.run_url,
        published_at: new Date().toISOString(),
      },
    ],
  });

  if (!saved?.id) throw new Error('the digest upsert returned no row');
  log(`Digest row ${saved.id} for ${digest.digest_date}`);

  await request(`${base}/news_stories?digest_id=eq.${saved.id}`, config.key, {
    method: 'DELETE',
    prefer: 'return=minimal',
  });

  await request(`${base}/news_stories`, config.key, {
    method: 'POST',
    prefer: 'return=minimal',
    body: storyRows.map((story) => ({ ...story, digest_id: saved.id })),
  });
  log(`Inserted ${storyRows.length} stories`);

  await request(`${base}/news_digests?id=eq.${saved.id}`, config.key, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: { story_count: storyRows.length },
  });

  const stored = await request(
    `${base}/news_stories?select=id&digest_id=eq.${saved.id}`,
    config.key
  );
  if (!Array.isArray(stored) || stored.length !== storyRows.length) {
    throw new Error(
      `verification failed: expected ${storyRows.length} stories, found ${
        Array.isArray(stored) ? stored.length : 'none'
      }`
    );
  }

  log(`Published ${stored.length} stories for ${digest.digest_date}`);
  return { id: saved.id, dryRun: false };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const digest = JSON.parse(await readFile(options.digest, 'utf8'));
  const config = readConfig();
  await publishDigest({ config, digest, dryRun: options.dryRun });
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]).endsWith('publish-digest.mjs');

if (invokedDirectly) {
  main().catch((error) => {
    console.error(`publish-digest failed: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
