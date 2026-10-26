#!/usr/bin/env node
/**
 * Publishes a validated digest to Supabase.
 *
 *   node scripts/news/publish-digest.mjs --digest .news/resolved.json [--dry-run]
 *
 * Uses PostgREST with the service role, not an app route: the workflow has no
 * serverless time limit to respect, and the web app must stay read-only for this
 * table.
 *
 * The whole write is one request to `publish_news_digest`
 * (20261026130000_publish_news_digest_atomically.sql), because it is one
 * transaction there: upsert the day's digest keeping its id, replace its stories,
 * set `story_count` to what was inserted. Four separate requests — the shape this
 * script used to have — cannot be atomic, so a failure after the delete left the
 * day's digest with no stories, or emptied the digest a re-run was replacing.
 *
 * A digest already exists for the day? It is replaced. Nothing else is touched.
 * The read-back afterwards is the check that the write it reports is the write a
 * reader will see.
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

  const [published] = await request(`${base}/rpc/publish_news_digest`, config.key, {
    method: 'POST',
    body: {
      p_digest: {
        digest_date: digest.digest_date,
        title: digest.title,
        lede: digest.lede,
        model: digest.model,
        run_url: digest.run_url,
        published_at: new Date().toISOString(),
      },
      p_stories: storyRows,
    },
  });

  if (!published?.digest_id) throw new Error('publish_news_digest returned no digest');
  log(`Digest row ${published.digest_id} for ${digest.digest_date}`);

  if (published.story_count !== storyRows.length) {
    throw new Error(
      `publish_news_digest reported ${published.story_count} stories, expected ${storyRows.length}`
    );
  }

  const stored = await request(
    `${base}/news_stories?select=id&digest_id=eq.${published.digest_id}`,
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
  return { id: published.digest_id, dryRun: false };
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
