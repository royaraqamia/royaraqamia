import { describe, expect, it, vi } from 'vitest';

import {
  FeedProbeError,
  probeFeed,
  type FeedProbeLookup,
} from '@/backend/services/news/feed-probe';

const PUBLIC_ADDRESS = { address: '93.184.216.34', family: 4 };
const MAX_FEED_BYTES = 512 * 1024;

function publicLookup(): FeedProbeLookup {
  return vi.fn(async () => [PUBLIC_ADDRESS]);
}

function response(body: string, init: { status?: number; contentType?: string } = {}): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { 'content-type': init.contentType ?? 'application/rss+xml' },
  });
}

function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

/** A body that never ends until the reader stops pulling. */
function streamingBody(
  chunk: Uint8Array,
  pulls: number
): { body: ReadableStream<Uint8Array>; pulled: () => number } {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= pulls) {
        controller.close();
        return;
      }
      sent += 1;
      controller.enqueue(chunk);
    },
  });
  return { body, pulled: () => sent };
}

describe('feed probe', () => {
  it('accepts an RSS document and counts its items', async () => {
    const fetchImpl = vi.fn(async () =>
      response(
        '<rss><channel><item><title>a</title></item><item><title>b</title></item></channel></rss>'
      )
    );

    await expect(probeFeed('https://example.com/rss', fetchImpl, publicLookup())).resolves.toEqual({
      itemCount: 2,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('accepts a feed that answers text/html, as some do', async () => {
    const fetchImpl = vi.fn(async () =>
      response('<feed><entry><title>a</title></entry></feed>', { contentType: 'text/html' })
    );

    await expect(probeFeed('https://example.com/feed', fetchImpl, publicLookup())).resolves.toEqual(
      { itemCount: 1 }
    );
  });

  it('refuses a page that is not a feed', async () => {
    const fetchImpl = vi.fn(async () =>
      response('<html><body><h1>News</h1></body></html>', { contentType: 'text/html' })
    );

    await expect(probeFeed('https://example.com', fetchImpl, publicLookup())).rejects.toMatchObject(
      { failure: 'not-a-feed' }
    );
  });

  it('refuses a feed with no items', async () => {
    const fetchImpl = vi.fn(async () => response('<rss><channel></channel></rss>'));

    await expect(
      probeFeed('https://example.com/rss', fetchImpl, publicLookup())
    ).rejects.toBeInstanceOf(FeedProbeError);
  });

  it('reports a host that cannot be reached separately from a bad document', async () => {
    const fetchImpl = vi.fn(async () => response('', { status: 503 }));
    await expect(
      probeFeed('https://example.com/rss', fetchImpl, publicLookup())
    ).rejects.toMatchObject({ failure: 'unreachable' });

    const throwing = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    await expect(
      probeFeed('https://example.com/rss', throwing, publicLookup())
    ).rejects.toMatchObject({ failure: 'unreachable' });
  });

  it('refuses a non-http scheme without fetching it', async () => {
    const fetchImpl = vi.fn();
    const lookupImpl = vi.fn();

    await expect(probeFeed('file:///etc/passwd', fetchImpl, lookupImpl)).rejects.toMatchObject({
      failure: 'not-a-feed',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(lookupImpl).not.toHaveBeenCalled();
  });

  it.each([
    'http://127.0.0.1/',
    'http://localhost:3000/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://10.0.0.5/',
    'http://192.168.1.1/',
    'http://172.16.0.1/',
    'http://0.0.0.0/',
    'http://[fe80::1]/',
    'http://[fd00::1]/',
  ])('refuses the private target %s without an outbound request', async (url) => {
    const fetchImpl = vi.fn();
    const lookupImpl = vi.fn();

    await expect(probeFeed(url, fetchImpl, lookupImpl)).rejects.toMatchObject({
      failure: 'not-a-feed',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(lookupImpl).not.toHaveBeenCalled();
  });

  it('refuses a public name that resolves to a private address', async () => {
    const fetchImpl = vi.fn();
    const lookupImpl = vi.fn(async () => [{ address: '10.0.0.5', family: 4 }]);

    await expect(
      probeFeed('https://internal.example/rss', fetchImpl, lookupImpl)
    ).rejects.toMatchObject({ failure: 'not-a-feed' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a name that resolves to a mix of public and private addresses', async () => {
    const fetchImpl = vi.fn();
    const lookupImpl = vi.fn(async () => [PUBLIC_ADDRESS, { address: '::1', family: 6 }]);

    await expect(probeFeed('https://example.com/rss', fetchImpl, lookupImpl)).rejects.toMatchObject(
      { failure: 'not-a-feed' }
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports an unresolvable host as unreachable without fetching it', async () => {
    const fetchImpl = vi.fn();
    const lookupImpl = vi.fn(async () => {
      throw new Error('ENOTFOUND');
    });

    await expect(probeFeed('https://example.com/rss', fetchImpl, lookupImpl)).rejects.toMatchObject(
      { failure: 'unreachable' }
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('accepts a name that resolves to a public IPv6 address', async () => {
    const fetchImpl = vi.fn(async () => response('<rss><channel><item>a</item></channel></rss>'));
    const lookupImpl = vi.fn(async () => [{ address: '2606:4700:4700::1111', family: 6 }]);

    await expect(probeFeed('https://example.com/rss', fetchImpl, lookupImpl)).resolves.toEqual({
      itemCount: 1,
    });
  });

  it('refuses a redirect that points at a private target at the hop', async () => {
    const fetchImpl = vi.fn(async () => redirect('http://169.254.169.254/latest/meta-data/'));
    const lookupImpl = publicLookup();

    await expect(probeFeed('https://example.com/rss', fetchImpl, lookupImpl)).rejects.toMatchObject(
      { failure: 'not-a-feed' }
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refuses a redirect whose hostname resolves to a private address', async () => {
    const fetchImpl = vi.fn(async () => redirect('https://internal.example/rss'));
    const lookupImpl = vi
      .fn<FeedProbeLookup>()
      .mockResolvedValueOnce([PUBLIC_ADDRESS])
      .mockResolvedValueOnce([{ address: 'fd00::1', family: 6 }]);

    await expect(probeFeed('https://example.com/rss', fetchImpl, lookupImpl)).rejects.toMatchObject(
      { failure: 'not-a-feed' }
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('follows a public redirect and counts the items at the destination', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(redirect('https://example.com/feed.xml'))
      .mockResolvedValueOnce(response('<rss><channel><item>a</item></channel></rss>'));
    const lookupImpl = publicLookup();

    await expect(probeFeed('https://example.com/rss', fetchImpl, lookupImpl)).resolves.toEqual({
      itemCount: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(lookupImpl).toHaveBeenCalledTimes(2);
  });

  it('gives up after more than three redirects', async () => {
    const fetchImpl = vi.fn(async () => redirect('https://example.com/next'));

    await expect(
      probeFeed('https://example.com/rss', fetchImpl, publicLookup())
    ).rejects.toMatchObject({ failure: 'unreachable' });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('refuses a body that declares more than the cap', async () => {
    const fetchImpl = vi.fn(async () => {
      const body = new Response('<rss><channel><item>a</item></channel></rss>');
      const headers = new Headers(body.headers);
      headers.set('content-length', String(600 * 1024));
      return new Response(body.body, { headers });
    });

    await expect(
      probeFeed('https://example.com/rss', fetchImpl, publicLookup())
    ).rejects.toMatchObject({ failure: 'not-a-feed' });
  });

  it('aborts an oversized chunked body at the cap instead of reading it whole', async () => {
    const chunk = new Uint8Array(128 * 1024).fill(0x20);
    const { body, pulled } = streamingBody(chunk, 100);
    const fetchImpl = vi.fn(
      async () => new Response(body, { headers: { 'content-type': 'application/rss+xml' } })
    );

    await expect(
      probeFeed('https://example.com/rss', fetchImpl, publicLookup())
    ).rejects.toMatchObject({ failure: 'not-a-feed' });
    expect(pulled()).toBeLessThan(100);
  });

  it('still accepts a feed at the cap', async () => {
    const prefix = '<rss><channel><item>a</item>';
    const padding = ' '.repeat(MAX_FEED_BYTES - prefix.length - '</channel></rss>'.length);
    const body = `${prefix}${padding}</channel></rss>`;
    const fetchImpl = vi.fn(async () => response(body));

    expect(new TextEncoder().encode(body).byteLength).toBe(MAX_FEED_BYTES);
    await expect(probeFeed('https://example.com/rss', fetchImpl, publicLookup())).resolves.toEqual({
      itemCount: 1,
    });
  });
});
