#!/usr/bin/env node
/**
 * Helpers shared by the digest scripts (`fetch-candidates.mjs`,
 * `validate-digest.mjs`, `publish-digest.mjs`).
 *
 * The workflow runs these on a bare `ubuntu-latest` before the app's
 * dependencies are installed, so they are plain ESM with no third-party imports
 * and no imports from `shared/contracts` (a TypeScript module). The category and
 * region lists are mirrored in `shared/contracts/news.ts` and pinned by
 * `scripts/__tests__/news-digest.test.mjs`.
 *
 * The feed reader is deliberately small: the digest needs a title, a link, a
 * date and an excerpt from each entry, and RSS 2.0 and Atom spell those four
 * fields predictably. A full XML parser would be the wrong trade here — it adds
 * an install step to a job whose whole point is to run in under a minute — so the
 * reader is line-oriented, tolerant of CDATA, and yields fewer items rather than
 * throwing when a feed is malformed.
 */

import { readFileSync } from 'node:fs';

/** The feed's category/region fallbacks, as `data/news/sources.json` writes them. */
export const CATEGORIES = ['tech', 'politics', 'religion', 'economy', 'world', 'other'];
export const REGIONS = ['arab', 'islamic', 'world'];

export const USER_AGENT = 'royaraqamia-news-digest/1.0 (+https://royaraqamia.com)';

/** Query parameters that only identify a campaign, never the article. */
const TRACKING_PARAM = /^(?:utm_|at_|traffic_|ito$|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|source$)/i;

/** Arabic diacritics and tatweel, which must not decide a duplicate. */
const ARABIC_MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

export function decodeEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

export function stripHtml(value) {
  return decodeEntities(
    String(value ?? '')
      .replace(/<script\b[\s\S]*?<\/script[^>]*>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style[^>]*>/gi, ' ')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, ' $1 ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** A single-line excerpt of at most `max` characters, cut on a word boundary. */
export function excerpt(value, max = 320) {
  const text = stripHtml(value);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const boundary = cut.lastIndexOf(' ');
  return `${(boundary > max * 0.6 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
}

/**
 * The URL a story is deduplicated and published by: tracking parameters and the
 * fragment removed, host lowercased, one trailing slash dropped. The published
 * link is this cleaned form — a reader should never land through a campaign tag.
 */
export function canonicalUrl(value) {
  try {
    const url = new URL(value);
    // Only http(s) is a link a reader can follow, and only http(s) is a feed we
    // can fetch; a `javascript:` or `data:` hand-off is dropped here rather than
    // carried around until something publishes it.
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
    }
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return null;
  }
}

/** Only http(s) links are publishable; feed hand-offs to javascript: are not. */
export function isPublishableUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Title comparison key: diacritics and punctuation removed, lowercased. */
export function normalizeTitle(value) {
  return stripHtml(value)
    .replace(ARABIC_MARKS, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Token overlap; enough to catch the same story syndicated under two titles. */
export function titleSimilarity(a, b) {
  const left = new Set(normalizeTitle(a).split(' ').filter(Boolean));
  const right = new Set(normalizeTitle(b).split(' ').filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

/**
 * Parses a feed date into ISO, tolerating RFC 822 (RSS) and ISO 8601 (Atom).
 * Returns null rather than inventing a date: a story with no timestamp is still
 * usable, it just sorts last and is labelled without a time.
 */
export function toIsoDate(value) {
  if (!value) return null;
  const parsed = new Date(String(value).trim());
  if (Number.isNaN(parsed.getTime())) return null;
  // A feed clock decades off is not a publication date; treating it as "now"
  // would let it outrank real news.
  const year = parsed.getUTCFullYear();
  if (year < 2000 || year > 2100) return null;
  return parsed.toISOString();
}

export function isFresh(iso, hours, now = Date.now()) {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return false;
  const age = now - time;
  return age <= hours * 60 * 60 * 1000 && age >= -6 * 60 * 60 * 1000;
}

export function readSources(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  if (!parsed || !Array.isArray(parsed.sources) || parsed.sources.length === 0) {
    throw new Error(`${path}: expected a non-empty "sources" array`);
  }

  const seen = new Set();
  return parsed.sources.map((source, index) => {
    const id = String(source?.id ?? '').trim();
    const name = String(source?.name ?? '').trim();
    const url = canonicalUrl(String(source?.url ?? ''));

    if (!id || !name || !url) {
      throw new Error(`${path}: source #${index + 1} needs id, name and url`);
    }
    if (seen.has(id)) throw new Error(`${path}: duplicate source id "${id}"`);
    seen.add(id);

    if (!CATEGORIES.includes(source.category)) {
      throw new Error(`${path}: ${id} has unknown category "${source.category}"`);
    }
    if (!REGIONS.includes(source.region)) {
      throw new Error(`${path}: ${id} has unknown region "${source.region}"`);
    }

    // A feed that publishes a few times a week (the scholarly religion feeds)
    // cannot fill a slot inside 48 hours; each source may widen its own window.
    const freshHours = source.freshHours === undefined ? null : Number(source.freshHours);
    if (
      freshHours !== null &&
      (!Number.isFinite(freshHours) || freshHours < 1 || freshHours > 336)
    ) {
      throw new Error(`${path}: ${id} has an unusable freshHours "${source.freshHours}"`);
    }

    return {
      id,
      name,
      url,
      category: source.category,
      region: source.region,
      tier: source.tier === 2 ? 2 : 1,
      freshHours,
    };
  });
}

/** One element's text, CDATA unwrapped. Namespaced tags are matched literally. */
function tagText(block, names) {
  for (const name of names) {
    const match = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(block);
    if (match) return match[1];
  }
  return '';
}

/** `<link>` is text in RSS and a self-closing element with `href` in Atom. */
function entryLink(block) {
  const textLink = tagText(block, ['link']);
  if (textLink.trim()) return textLink;

  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)];
  if (links.length === 0) return tagText(block, ['guid', 'id']);

  const parsed = links.map(([, attributes]) => ({
    href: /href\s*=\s*"([^"]*)"/i.exec(attributes)?.[1] ?? '',
    rel: /rel\s*=\s*"([^"]*)"/i.exec(attributes)?.[1] ?? 'alternate',
  }));

  return (parsed.find((link) => link.rel === 'alternate') ?? parsed[0] ?? { href: '' }).href;
}

/**
 * One feed's items, normalised. Neither the RSS nor the Atom shape is trusted:
 * a feed that omits titles or links yields fewer items, not an exception.
 */
export function parseFeed(xml) {
  if (typeof xml !== 'string' || xml.length === 0) return [];

  const blocks = [...String(xml).matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
  if (blocks.length === 0) return [];

  return blocks
    .map(([, , block]) => ({
      title: stripHtml(tagText(block, ['title'])),
      url: canonicalUrl(stripHtml(entryLink(block))),
      publishedAt: toIsoDate(
        stripHtml(tagText(block, ['pubDate', 'dc:date', 'published', 'updated', 'date']))
      ),
      // `media:description` is what a YouTube channel feed uses for the item
      // text; without it a video arrives as a bare title.
      excerpt: excerpt(
        tagText(block, [
          'description',
          'content:encoded',
          'summary',
          'content',
          'media:description',
        ])
      ),
    }))
    .filter((item) => item.title && item.url);
}

export function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
