#!/usr/bin/env node
/**
 * Fetches the digest's candidate stories from the feeds in data/news/sources.json.
 *
 * The model never browses: it only ever sees this list, and
 * `validate-digest.mjs` refuses any URL that is not in it. That is the guard
 * against a summariser inventing a story or a link — the fetch is deterministic,
 * the model only selects and writes.
 *
 *   node scripts/news/fetch-candidates.mjs --out .news/candidates.json
 *
 * Cross-day duplicates: when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set,
 * URLs published in the last few days are read from `news_stories` and dropped
 * here, so a story that stays on a homepage for two days is not republished.
 *
 * Exit codes: 0 when enough candidates were collected, 1 otherwise. The workflow
 * treats a 1 as "do not publish anything", which is the correct outcome for a
 * day the feeds were unreachable.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  USER_AGENT,
  canonicalUrl,
  excerpt,
  isFresh,
  isPublishableUrl,
  mergeSources,
  parseFeed,
  parseTelegramPreview,
  readSources,
  titleSimilarity,
  toApprovedSource,
} from './lib.mjs';

const MAX_ITEMS_PER_SOURCE = 4;
const MAX_TOTAL_ITEMS = 90;
const FRESH_HOURS = 48;
const DEDUPE_TITLE_SIMILARITY = 0.75;
const MIN_CANDIDATES = 8;
const FETCH_TIMEOUT_MS = 20_000;
const FETCH_CONCURRENCY = 4;
const FETCH_BATCH_GAP_MS = 400;
const RECENT_DAYS = 4;

function parseArgs(argv) {
  const options = {
    out: resolve('.news', 'candidates.json'),
    sources: resolve('data', 'news', 'sources.json'),
    date: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--out' && value) {
      options.out = resolve(value);
      index += 1;
    } else if (flag === '--sources' && value) {
      options.sources = resolve(value);
      index += 1;
    } else if (flag === '--date' && value) {
      options.date = value;
      index += 1;
    }
  }

  return options;
}

/** The Damascus calendar day, which is the digest's own notion of "today". */
function damascusDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Damascus',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

async function fetchText(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': USER_AGENT,
      accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function fetchSource(source) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const body = await fetchText(source.url);
      // A Telegram channel has no XML document: its public preview is the feed.
      return source.kind === 'telegram' ? parseTelegramPreview(body) : parseFeed(body);
    } catch (error) {
      if (attempt === 2) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    }
  }
  return { error: 'unreachable' };
}

/**
 * The URLs already published in the last few days.
 *
 * Read with the service role because `news_stories` is readable by anon too, but
 * the workflow already holds the key and this keeps the query off the public API.
 * A missing configuration is not an error: the fetch simply cannot dedupe.
 */
async function loadRecentlyPublishedUrls(env = process.env) {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new Set();

  const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const endpoint = `${url}/rest/v1/news_stories?select=source_url&created_at=gte.${encodeURIComponent(since)}`;

  try {
    const response = await fetch(endpoint, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return new Set();
    const rows = await response.json();
    return new Set(
      (Array.isArray(rows) ? rows : [])
        .map((row) => canonicalUrl(String(row?.source_url ?? '')))
        .filter(Boolean)
    );
  } catch {
    // Deduplication is a nicety; a failed read must not cost the day's digest.
    return new Set();
  }
}

/**
 * The sources an Admin approved in `news_sources`, read with the service role.
 *
 * A missing configuration or a failed read is not an error: the fetch falls back
 * to the repo list, because a new source is worth having but never worth the
 * day's digest. A malformed row is dropped by `toApprovedSource`.
 */
async function loadApprovedSources(env = process.env) {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  const endpoint = `${url}/rest/v1/news_sources?select=id,name,url,kind,category,region,tier,fresh_hours&enabled=is.true`;

  try {
    const response = await fetch(endpoint, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return [];
    const rows = await response.json();
    return (Array.isArray(rows) ? rows : []).map(toApprovedSource).filter(Boolean);
  } catch {
    return [];
  }
}

function rank(candidate) {
  const published = candidate.publishedAt ? new Date(candidate.publishedAt).getTime() : 0;
  return [candidate.tier, published];
}

function compareCandidates(a, b) {
  const [tierA, timeA] = rank(a);
  const [tierB, timeB] = rank(b);
  if (tierA !== tierB) return tierA - tierB;
  return timeB - timeA;
}

export async function collectCandidates({
  sources,
  recentlyPublished = new Set(),
  now = Date.now(),
}) {
  // Four at a time, not nineteen: two of the feeds sit behind rate limiting, and
  // a burst of parallel requests from one IP is what a 403 looks like.
  const results = [];
  for (let index = 0; index < sources.length; index += FETCH_CONCURRENCY) {
    const batch = sources.slice(index, index + FETCH_CONCURRENCY);
    results.push(
      ...(await Promise.all(
        batch.map(async (source) => ({ source, items: await fetchSource(source) }))
      ))
    );
    if (index + FETCH_CONCURRENCY < sources.length) {
      await new Promise((resolve) => setTimeout(resolve, FETCH_BATCH_GAP_MS));
    }
  }

  const candidates = [];
  const failures = [];

  for (const { source, items } of results) {
    if (!Array.isArray(items)) {
      failures.push({ source: source.id, error: items.error });
      continue;
    }

    const fresh = items
      .filter((item) => item.url && item.title && isPublishableUrl(item.url))
      .filter((item) => !recentlyPublished.has(canonicalUrl(item.url)))
      .filter((item) => isFresh(item.publishedAt, source.freshHours ?? FRESH_HOURS, now))
      .sort(
        (a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime()
      )
      .slice(0, MAX_ITEMS_PER_SOURCE);

    if (fresh.length === 0) failures.push({ source: source.id, error: 'no fresh items' });

    for (const item of fresh) {
      candidates.push({
        id: `${source.id}:${candidates.length + 1}`,
        title: item.title,
        url: item.url,
        publishedAt: item.publishedAt,
        excerpt: excerpt(item.excerpt, 320),
        sourceId: source.id,
        sourceName: source.name,
        category: source.category,
        region: source.region,
        tier: source.tier,
      });
    }
  }

  const seenUrls = new Set();
  const kept = [];
  for (const candidate of [...candidates].sort(compareCandidates)) {
    if (seenUrls.has(candidate.url)) continue;
    const duplicate = kept.some(
      (existing) => titleSimilarity(existing.title, candidate.title) >= DEDUPE_TITLE_SIMILARITY
    );
    if (duplicate) continue;
    seenUrls.add(candidate.url);
    kept.push(candidate);
  }

  return {
    items: kept.slice(0, MAX_TOTAL_ITEMS),
    failures,
    fetched: candidates.length,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.date && !/^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
    throw new Error(`--date must be YYYY-MM-DD, got "${options.date}"`);
  }
  const fileSources = readSources(options.sources);
  const approved = await loadApprovedSources();
  const sources = mergeSources(fileSources, approved);
  const recentlyPublished = await loadRecentlyPublishedUrls();
  const { items, failures, fetched } = await collectCandidates({ sources, recentlyPublished });

  // A manual run may publish for another day; the prompt's date must be the one
  // the validator will check, not necessarily the day the fetch happens.
  const digestDate = options.date || damascusDate();
  const payload = {
    generatedAt: new Date().toISOString(),
    digestDate,
    sourceCount: sources.length,
    itemCount: items.length,
    items,
  };

  await mkdir(dirname(options.out), { recursive: true });
  await writeFile(options.out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(`Sources: ${sources.length}, fetched items: ${fetched}, candidates: ${items.length}`);
  if (approved.length > 0) {
    console.log(
      `  ${sources.length - fileSources.length} approved source(s) merged from the database`
    );
  }
  for (const failure of failures) console.log(`  skipped ${failure.source}: ${failure.error}`);
  if (recentlyPublished.size > 0) {
    console.log(`Dropped ${recentlyPublished.size} recently published URL(s).`);
  }
  console.log(`Wrote ${options.out} for ${digestDate}`);

  if (items.length < MIN_CANDIDATES) {
    console.error(
      `Only ${items.length} usable candidates (need ${MIN_CANDIDATES}); refusing to ask the model for a digest.`
    );
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]).endsWith('fetch-candidates.mjs');

if (invokedDirectly) {
  main().catch((error) => {
    console.error(`fetch-candidates failed: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
