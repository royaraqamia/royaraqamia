import { logger } from '@/backend/shared/logger';

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
 * `fetch` is injected so the failure paths are testable without a network.
 */

const TIMEOUT_MS = 8_000;
const MAX_BYTES = 512 * 1024;

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

const FEED_MIME = /(application|text)\/(rss|atom)\+xml|application\/xml|text\/xml/i;
const FEED_ROOT = /<(rss|feed|rdf:RDF)\b/i;
const ITEM = /<(item|entry)\b/gi;

function countItems(text: string): number {
  return text.match(ITEM)?.length ?? 0;
}

export async function probeFeed(
  url: string,
  fetchImpl: typeof fetch = fetch
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

  let response: Response;
  try {
    response = await fetchImpl(target.toString(), {
      redirect: 'follow',
      headers: {
        // The same identity the digest workflow uses, so a host that blocks
        // unknown clients answers this probe the way it would answer the fetch.
        'user-agent': 'royaraqamia-news-digest/1.0 (+https://royaraqamia.com)',
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    logger.info('News source probe could not reach the feed', {
      url: target.host,
      error: String(error),
    });
    throw new FeedProbeError('unreachable');
  }

  if (!response.ok) {
    logger.info('News source probe got a non-2xx answer', {
      url: target.host,
      status: response.status,
    });
    throw new FeedProbeError('unreachable');
  }

  const declaredLength = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
    throw new FeedProbeError('not-a-feed');
  }

  const text = (await response.text()).slice(0, MAX_BYTES);
  const contentType = response.headers.get('content-type') ?? '';
  const looksLikeFeed = FEED_MIME.test(contentType) || FEED_ROOT.test(text);

  if (!looksLikeFeed) throw new FeedProbeError('not-a-feed');

  const itemCount = countItems(text);
  if (itemCount === 0) throw new FeedProbeError('not-a-feed');

  return { itemCount };
}
