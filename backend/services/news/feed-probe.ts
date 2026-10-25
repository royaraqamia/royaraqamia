import { lookup } from 'node:dns/promises';

import { logger } from '@/backend/shared/logger';
import { isPublicHttpUrl, isPublicIpAddress, normalizeHostname } from '@/shared/network';

/**
 * Checks that a URL a reader submitted is actually a feed before it reaches the
 * Admin queue.
 *
 * This is a usability gate, not a trust decision: the probe answers "would the
 * daily fetch get anything from this?", and the approval is still a person's.
 * It is deliberately tolerant of a mislabelled `content-type` (some feeds answer
 * `text/html`) and deliberately strict about size and time, because the caller
 * is a public form and the target is an arbitrary host.
 *
 * The target and every redirect hop are validated before a request is made, and
 * the body is read through a byte-counting reader, because a reader could
 * otherwise point the function at loopback, link-local or private addresses, or
 * hand it an unbounded chunked stream.
 *
 * `fetch` and `lookup` are injected so the failure paths are testable without a
 * network.
 */

const TIMEOUT_MS = 8_000;
const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const REQUEST_HEADERS = {
  // The same identity the digest workflow uses, so a host that blocks unknown
  // clients answers this probe the way it would answer the fetch.
  'user-agent': 'royaraqamia-news-digest/1.0 (+https://royaraqamia.com)',
  accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html',
};

export type FeedProbeFailure = 'unreachable' | 'not-a-feed';

export class FeedProbeError extends Error {
  constructor(readonly failure: FeedProbeFailure) {
    super(failure === 'unreachable' ? 'the feed could not be fetched' : 'the URL is not a feed');
    this.name = 'FeedProbeError';
  }
}

export interface FeedProbeResult {
  /** How many items the document carries; at least one, or the probe fails. */
  itemCount: number;
}

export type FeedProbeLookup = (
  host: string
) => Promise<readonly { address: string; family: number }[]>;

const systemLookup: FeedProbeLookup = (host) => lookup(host, { all: true });

const FEED_MIME = /(application|text)\/(rss|atom)\+xml|application\/xml|text\/xml/i;
const FEED_ROOT = /<(rss|feed|rdf:RDF)\b/i;
const ITEM = /<(item|entry)\b/gi;

function countItems(text: string): number {
  return text.match(ITEM)?.length ?? 0;
}

/** The host as a browser or resolver writes it: no brackets, no trailing dot. */
function hostOf(target: URL): string {
  return normalizeHostname(target.hostname.replace(/^\[|\]$/g, ''));
}

/**
 * Refuse a target before any request leaves the process. The literal check
 * catches private addresses and `localhost`; the resolver check catches a public
 * name that points at one. Every address must be public: a host that resolves to
 * both a public and a private address is not a feed target.
 */
async function assertPublicTarget(target: URL, lookupImpl: FeedProbeLookup): Promise<void> {
  if (!isPublicHttpUrl(target.toString())) {
    throw new FeedProbeError('not-a-feed');
  }

  const host = hostOf(target);
  let addresses: readonly { address: string; family: number }[];
  try {
    addresses = await lookupImpl(host);
  } catch (error) {
    logger.info('News source probe could not resolve the feed host', {
      url: host,
      error: String(error),
    });
    throw new FeedProbeError('unreachable');
  }

  if (addresses.length === 0 || addresses.some((entry) => !isPublicIpAddress(entry.address))) {
    logger.info('News source probe refused a non-public target', { url: host });
    throw new FeedProbeError('not-a-feed');
  }
}

/**
 * Read at most `MAX_BYTES`, aborting the reader as soon as the cap is crossed.
 * The decoder keeps multi-byte characters intact across chunk boundaries.
 */
async function readCappedBody(response: Response): Promise<string> {
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw new FeedProbeError('not-a-feed');

      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export async function probeFeed(
  url: string,
  fetchImpl: typeof fetch = fetch,
  lookupImpl: FeedProbeLookup = systemLookup
): Promise<FeedProbeResult> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new FeedProbeError('not-a-feed');
  }

  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    throw new FeedProbeError('not-a-feed');
  }

  let redirects = 0;
  for (;;) {
    await assertPublicTarget(target, lookupImpl);

    let response: Response;
    try {
      response = await fetchImpl(target.toString(), {
        redirect: 'manual',
        headers: REQUEST_HEADERS,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      logger.info('News source probe could not reach the feed', {
        url: hostOf(target),
        error: String(error),
      });
      throw new FeedProbeError('unreachable');
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location');
      if (redirects >= MAX_REDIRECTS || !location) {
        logger.info('News source probe gave up on a redirect chain', {
          url: hostOf(target),
          status: response.status,
        });
        throw new FeedProbeError('unreachable');
      }

      let next: URL;
      try {
        next = new URL(location, target);
      } catch {
        throw new FeedProbeError('unreachable');
      }

      redirects += 1;
      target = next;
      continue;
    }

    if (!response.ok) {
      logger.info('News source probe got a non-2xx answer', {
        url: hostOf(target),
        status: response.status,
      });
      throw new FeedProbeError('unreachable');
    }

    const declaredLength = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
      throw new FeedProbeError('not-a-feed');
    }

    let text: string;
    try {
      text = await readCappedBody(response);
    } catch (error) {
      if (error instanceof FeedProbeError) throw error;
      logger.info('News source probe failed while reading the feed', {
        url: hostOf(target),
        error: String(error),
      });
      throw new FeedProbeError('unreachable');
    }

    const contentType = response.headers.get('content-type') ?? '';
    const looksLikeFeed = FEED_MIME.test(contentType) || FEED_ROOT.test(text);

    if (!looksLikeFeed) throw new FeedProbeError('not-a-feed');

    const itemCount = countItems(text);
    if (itemCount === 0) throw new FeedProbeError('not-a-feed');

    return { itemCount };
  }
}
