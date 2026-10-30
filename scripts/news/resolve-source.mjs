#!/usr/bin/env node
/**
 * Turns whatever URL a reader pasted into something the digest can fetch.
 *
 * A reader does not know what RSS is, and the product no longer asks them to
 * (ADR-0105). This is the half that answers "what is this link?": it recognises
 * a feed, a page that advertises one, a YouTube channel and a Telegram channel,
 * and it says plainly which platforms it cannot read at all, so the Admin queue
 * shows a reason instead of a silent dead source.
 *
 *   node scripts/news/resolve-source.mjs            # drain the queue
 *   node scripts/news/resolve-source.mjs --dry-run  # print, write nothing
 *
 * Plain ESM with no third-party imports, like the rest of `scripts/news/`: the
 * workflow runs it on a bare `ubuntu-latest` without an install step. The
 * behaviour is pinned by `scripts/__tests__/news-resolve-source.test.mjs`.
 *
 * The public-target guard is a mirror of `shared/network.ts`, which this file
 * cannot import (a TypeScript module, and the job installs no compiler). The
 * test compares the two on the same corpus, so a guard that drifts shows up as
 * a failure rather than as an SSRF.
 *
 * The worker holds the service role, so nothing here trusts the reader: every
 * hop of every redirect is validated before a request leaves the process, and
 * the body is read through a byte-counting reader.
 */

import { lookup } from 'node:dns/promises';

export const USER_AGENT = 'royaraqamia-news-digest/1.0 (+https://royaraqamia.com)';

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** How many well-known feed paths one page may try before the queue moves on. */
const FEED_PATHS = ['/feed', '/rss', '/rss.xml', '/atom.xml', '/feed.xml', '/index.xml'];
const MAX_PATH_TRIES = 4;

/**
 * Platforms that publish no free, public, machine-readable feed. The detail is
 * what the Admin sees, and it is the honest reason rather than "not a feed".
 */
const UNSUPPORTED_PLATFORMS = [
  { suffix: 'facebook.com', platform: 'facebook' },
  { suffix: 'fb.com', platform: 'facebook' },
  { suffix: 'fb.watch', platform: 'facebook' },
  { suffix: 'x.com', platform: 'x' },
  { suffix: 'twitter.com', platform: 'x' },
  { suffix: 'instagram.com', platform: 'instagram' },
];

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
]);
const TELEGRAM_HOSTS = new Set(['t.me', 'telegram.me', 'telegram.dog', 'telegram.org']);

/** Path prefixes that are not a channel name. */
const TELEGRAM_RESERVED = new Set([
  'share',
  'iv',
  'joinchat',
  'addlist',
  'addstickers',
  'setlanguage',
  'login',
  'socks',
  'proxy',
]);

// ------------------------------------------------------------
// The public-target guard — mirrors shared/network.ts
// ------------------------------------------------------------

function isIpv4Public([a = 0, b = 0, c = 0]) {
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false;
  return true;
}

function parseIpv4(value) {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const octets = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    octets.push(octet);
  }
  return octets;
}

function parseIpv6(value) {
  let text = value.toLowerCase();
  const zone = text.indexOf('%');
  if (zone !== -1) text = text.slice(0, zone);
  if (!text.includes(':')) return null;

  const lastColon = text.lastIndexOf(':');
  const tail = text.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = parseIpv4(tail);
    if (!v4) return null;
    const high = ((v4[0] << 8) | v4[1]).toString(16);
    const low = ((v4[2] << 8) | v4[3]).toString(16);
    text = `${text.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = text.split('::');
  if (halves.length > 2) return null;

  const parseHalf = (half) => {
    if (half === '') return [];
    const out = [];
    for (const group of half.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
      out.push(Number.parseInt(group, 16));
    }
    return out;
  };

  let groups;
  if (halves.length === 2) {
    const head = parseHalf(halves[0] ?? '');
    const tailGroups = parseHalf(halves[1] ?? '');
    if (!head || !tailGroups) return null;
    const zeros = 8 - head.length - tailGroups.length;
    if (zeros < 0) return null;
    groups = [...head, ...new Array(zeros).fill(0), ...tailGroups];
  } else {
    const head = parseHalf(halves[0] ?? '');
    if (!head) return null;
    groups = head;
  }

  return groups.length === 8 ? groups : null;
}

function isIpv6Private(groups) {
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = groups;

  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return !isIpv4Public([(g6 >> 8) & 0xff, g6 & 0xff, (g7 >> 8) & 0xff, g7 & 0xff]);
  }

  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return !isIpv4Public([(g6 >> 8) & 0xff, g6 & 0xff, (g7 >> 8) & 0xff, g7 & 0xff]);
  }

  if ((g0 & 0xfe00) === 0xfc00) return true;
  if ((g0 & 0xffc0) === 0xfe80) return true;
  if ((g0 & 0xffc0) === 0xfec0) return true;
  if ((g0 & 0xff00) === 0xff00) return true;
  if (g0 === 0x2001 && g1 === 0x0db8) return true;

  if (g0 === 0x2002) {
    return !isIpv4Public([(g1 >> 8) & 0xff, g1 & 0xff, (g2 >> 8) & 0xff, g2 & 0xff]);
  }

  if (g0 === 0x0064 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return !isIpv4Public([(g6 >> 8) & 0xff, g6 & 0xff, (g7 >> 8) & 0xff, g7 & 0xff]);
  }

  return false;
}

/**
 * A public *address*, as a resolver returned it. Refuses the loopback, private,
 * link-local and special-purpose ranges, and fails closed on anything it cannot
 * parse.
 */
export function isPublicIpAddress(value) {
  const host = String(value)
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
  const ipv4 = parseIpv4(host);
  if (ipv4) return isIpv4Public(ipv4);

  const ipv6 = parseIpv6(host);
  if (ipv6) return !isIpv6Private(ipv6);

  return false;
}

/**
 * An http(s) URL whose host is a public name or address. A hostname that
 * *resolves* to a private address is the transport's check, not this one.
 */
export function isPublicHttpUrl(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

  const host = url.hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
  if (host.length === 0) return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (host.includes(':')) return false;

  const ipv4 = parseIpv4(host);
  if (ipv4) return isIpv4Public(ipv4);
  return true;
}

// ------------------------------------------------------------
// Classification — what kind of link is this, before any request
// ------------------------------------------------------------

function baseHost(hostname) {
  return hostname
    .replace(/\.$/, '')
    .toLowerCase()
    .replace(/^www\./, '');
}

function unsupportedPlatform(host) {
  for (const entry of UNSUPPORTED_PLATFORMS) {
    if (host === entry.suffix || host.endsWith(`.${entry.suffix}`)) return entry.platform;
  }
  return null;
}

/**
 * Reads the URL's shape alone. Pure, so the shape rules are testable without a
 * network and the worker knows what it is about to fetch before it fetches.
 */
export function classifySourceUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl));
  } catch {
    return { kind: 'invalid' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { kind: 'invalid' };

  const host = baseHost(url.hostname);
  const segments = url.pathname.split('/').filter(Boolean);

  const platform = unsupportedPlatform(host);
  if (platform) return { kind: 'unsupported', platform };

  if (YOUTUBE_HOSTS.has(host)) {
    if (host === 'youtu.be') {
      return { kind: 'youtube-video' };
    }
    if (segments[0] === 'channel' && segments[1]) {
      const channelId = segments[1];
      return /^UC[\w-]{22}$/.test(channelId)
        ? { kind: 'youtube-channel', channelId }
        : { kind: 'youtube-handle', handle: channelId };
    }
    if (segments[0] === 'watch' || segments[0] === 'shorts' || segments[0] === 'live') {
      return { kind: 'youtube-video' };
    }
    if (
      segments[0] &&
      (segments[0].startsWith('@') || segments[0] === 'c' || segments[0] === 'user')
    ) {
      const handle = segments[0].startsWith('@') ? segments[0] : segments[1];
      return handle ? { kind: 'youtube-handle', handle } : { kind: 'youtube-video' };
    }
    return { kind: 'youtube-video' };
  }

  if (TELEGRAM_HOSTS.has(host)) {
    // `t.me/s/<name>` is the public preview of the channel itself.
    const name = segments[0] === 's' ? segments[1] : segments[0];
    if (!name || name.startsWith('+') || TELEGRAM_RESERVED.has(name)) {
      return { kind: 'unsupported', platform: 'telegram' };
    }
    return { kind: 'telegram', channel: name };
  }

  return { kind: 'feed', url: url.toString() };
}

// ------------------------------------------------------------
// Transport
// ------------------------------------------------------------

/** Every resolved address must be public: a host answering both is not a target. */
async function assertPublicTarget(target, resolveHost) {
  if (!isPublicHttpUrl(target)) throw new Error('not a public target');

  const host = new URL(target).hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) throw new Error('not a public target');
  if (parseIpv4(host) || host.includes(':')) return;

  const addresses = await resolveHost(host);
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new Error(`could not resolve ${host}`);
  }
  for (const address of addresses) {
    if (!isPublicIpAddress(String(address?.address ?? address))) {
      throw new Error(`${host} resolves to a private address`);
    }
  }
}

function readWithLimit(response, maxBytes) {
  const declared = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`response larger than ${maxBytes} bytes`);
  }
  if (!response.body) return response.text();

  return (async () => {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`response larger than ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
    return new TextDecoder('utf-8').decode(
      Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
    );
  })();
}

/**
 * The default transport: manual redirects so every hop is validated, a capped
 * body, a capped wait, and the same identity the digest fetch uses.
 */
export async function fetchPage(url, { fetchImpl = fetch, resolveHost } = {}) {
  const resolve = resolveHost ?? (async (host) => lookup(host, { all: true }));

  let target = String(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicTarget(target, resolve);

    const response = await fetchImpl(target, {
      redirect: 'manual',
      headers: {
        'user-agent': USER_AGENT,
        accept:
          'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`HTTP ${response.status} without a location`);
      target = new URL(location, target).toString();
      continue;
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    return { text: await readWithLimit(response, MAX_BYTES), finalUrl: target };
  }

  throw new Error('too many redirects');
}

// ------------------------------------------------------------
// Feed discovery
// ------------------------------------------------------------

const FEED_ROOT = /<(?:rss|feed|rdf:RDF)\b/i;

/**
 * Whether a document announces itself as a feed.
 *
 * A page that only *links* a feed also carries `<link>` tags, so the test is the
 * root element plus the absence of an `<html>` document: an XML prolog, a
 * doctype or leading comments are all fine, a web page is not.
 */
export function looksLikeFeed(text) {
  if (typeof text !== 'string') return false;
  const head = text.slice(0, 4096);
  if (!FEED_ROOT.test(head)) return false;
  return !/<html[\s>]/i.test(head);
}

function decodeAttribute(value) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

/**
 * The feed a page advertises with `<link rel="alternate">`.
 *
 * Attributes arrive in any order, and some publishers omit `rel`, so the pairs
 * are read independently instead of matched positionally.
 */
export function findAdvertisedFeeds(html, baseUrl) {
  const found = [];
  for (const match of String(html).matchAll(/<link\b([^>]*)>/gi)) {
    const attributes = match[1] ?? '';
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
    if (!href) continue;

    const rel = /rel\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1]?.toLowerCase() ?? '';
    const type = /type\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1]?.toLowerCase() ?? '';

    const isAlternate = rel.split(/\s+/).includes('alternate') || rel === '';
    const isFeedType = /^(?:application|text)\/(?:rss|atom)\+xml$/.test(type);
    if (!isAlternate || !isFeedType) continue;

    try {
      const resolved = new URL(decodeAttribute(href), baseUrl).toString();
      if (isPublicHttpUrl(resolved) && !found.includes(resolved)) found.push(resolved);
    } catch {
      // A malformed href is not a candidate; the next one may be.
    }
  }
  return found;
}

/** The well-known paths, absolute, in the order a reader would expect them. */
export function candidateFeedPaths(baseUrl) {
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const origin = base.origin;
  return FEED_PATHS.slice(0, MAX_PATH_TRIES).map((path) => `${origin}${path}`);
}

/**
 * The feed this page publishes, or null.
 *
 * Order matters: the page itself first (a feed URL pasted directly), then what
 * the page advertises, then the well-known paths. Every candidate is fetched and
 * checked, because a dead `<link>` is common and approving it would publish a
 * source that never yields a story.
 */
export async function discoverFeed(url, { fetchPageImpl }) {
  const page = await fetchPageImpl(url);
  if (looksLikeFeed(page.text)) return page.finalUrl;

  for (const candidate of findAdvertisedFeeds(page.text, page.finalUrl)) {
    try {
      const response = await fetchPageImpl(candidate);
      if (looksLikeFeed(response.text)) return response.finalUrl;
    } catch {
      // A broken advertisement is not the page's answer; keep looking.
    }
  }

  for (const candidate of candidateFeedPaths(page.finalUrl)) {
    try {
      const response = await fetchPageImpl(candidate);
      if (looksLikeFeed(response.text)) return response.finalUrl;
    } catch {
      // 404 on `/feed` is the normal case for most sites.
    }
  }

  return null;
}

// ------------------------------------------------------------
// Platform adapters
// ------------------------------------------------------------

const YOUTUBE_CHANNEL_ID = /"(?:externalId|channelId|browseId)"\s*:\s*"(UC[\w-]{22})"/;

/** The channel id a YouTube page carries, whichever shape the link had. */
export function youtubeChannelIdFromPage(html) {
  const match = YOUTUBE_CHANNEL_ID.exec(String(html));
  return match?.[1] ?? null;
}

export function youtubeFeedUrl(channelId) {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

export function telegramPreviewUrl(channel) {
  return `https://t.me/s/${channel}`;
}

/** Whether a `t.me/s/` document is the public preview of a real channel. */
export function isTelegramPreview(html) {
  return /tgme_channel_info\b|tgme_widget_message\b/.test(String(html));
}

// ------------------------------------------------------------
// The answer
// ------------------------------------------------------------

/**
 * Resolves one pasted URL.
 *
 * Returns `{ kind, url }` for something the digest can fetch, and
 * `{ failure, detail }` for the Admin queue. It never throws for a link the
 * reader typed: an unreachable host is an answer, not a crash.
 */
export async function resolveSourceUrl(rawUrl, { fetchPageImpl = fetchPage } = {}) {
  const classified = classifySourceUrl(rawUrl);
  if (classified.kind === 'invalid') {
    return { failure: 'unreachable', detail: 'not an http(s) URL' };
  }

  if (classified.kind === 'unsupported') {
    return {
      failure: 'unsupported',
      detail: `${classified.platform}: no free public feed; the source needs a human`,
    };
  }

  try {
    if (classified.kind === 'telegram') {
      const previewUrl = telegramPreviewUrl(classified.channel);
      const page = await fetchPageImpl(previewUrl);
      return isTelegramPreview(page.text)
        ? { kind: 'telegram', url: previewUrl }
        : { failure: 'unreachable', detail: `${classified.channel}: no public preview` };
    }

    if (classified.kind === 'youtube-channel') {
      const response = await fetchPageImpl(youtubeFeedUrl(classified.channelId));
      return looksLikeFeed(response.text)
        ? { kind: 'feed', url: youtubeFeedUrl(classified.channelId) }
        : { failure: 'no-feed', detail: `${classified.channelId}: channel feed is empty` };
    }

    if (classified.kind === 'youtube-handle' || classified.kind === 'youtube-video') {
      const page = await fetchPageImpl(rawUrl);
      const channelId = youtubeChannelIdFromPage(page.text);
      if (!channelId) {
        return { failure: 'unreachable', detail: 'youtube: no channel id in the page' };
      }
      const feedUrl = youtubeFeedUrl(channelId);
      const feed = await fetchPageImpl(feedUrl);
      return looksLikeFeed(feed.text)
        ? { kind: 'feed', url: feedUrl }
        : { failure: 'no-feed', detail: `${channelId}: channel feed is empty` };
    }

    const feedUrl = await discoverFeed(classified.url, { fetchPageImpl });
    return feedUrl
      ? { kind: 'feed', url: feedUrl }
      : { failure: 'no-feed', detail: 'no feed advertised and no well-known feed path answered' };
  } catch (error) {
    return {
      failure: 'unreachable',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
