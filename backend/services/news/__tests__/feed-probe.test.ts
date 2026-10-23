import { describe, expect, it, vi } from 'vitest';

import { FeedProbeError, probeFeed } from '@/backend/services/news/feed-probe';

function response(body: string, init: { status?: number; contentType?: string } = {}): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { 'content-type': init.contentType ?? 'application/rss+xml' },
  });
}

describe('feed probe', () => {
  it('accepts an RSS document and counts its items', async () => {
    const fetchImpl = vi.fn(async () =>
      response(
        '<rss><channel><item><title>a</title></item><item><title>b</title></item></channel></rss>'
      )
    );

    await expect(probeFeed('https://example.com/rss', fetchImpl)).resolves.toEqual({
      itemCount: 2,
    });
  });

  it('accepts a feed that answers text/html, as some do', async () => {
    const fetchImpl = vi.fn(async () =>
      response('<feed><entry><title>a</title></entry></feed>', { contentType: 'text/html' })
    );

    await expect(probeFeed('https://example.com/feed', fetchImpl)).resolves.toEqual({
      itemCount: 1,
    });
  });

  it('refuses a page that is not a feed', async () => {
    const fetchImpl = vi.fn(async () =>
      response('<html><body><h1>News</h1></body></html>', { contentType: 'text/html' })
    );

    await expect(probeFeed('https://example.com', fetchImpl)).rejects.toMatchObject({
      failure: 'not-a-feed',
    });
  });

  it('refuses a feed with no items', async () => {
    const fetchImpl = vi.fn(async () => response('<rss><channel></channel></rss>'));

    await expect(probeFeed('https://example.com/rss', fetchImpl)).rejects.toBeInstanceOf(
      FeedProbeError
    );
  });

  it('reports a host that cannot be reached separately from a bad document', async () => {
    const fetchImpl = vi.fn(async () => response('', { status: 503 }));
    await expect(probeFeed('https://example.com/rss', fetchImpl)).rejects.toMatchObject({
      failure: 'unreachable',
    });

    const throwing = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    await expect(probeFeed('https://example.com/rss', throwing)).rejects.toMatchObject({
      failure: 'unreachable',
    });
  });

  it('refuses a non-http scheme without fetching it', async () => {
    const fetchImpl = vi.fn();

    await expect(probeFeed('file:///etc/passwd', fetchImpl)).rejects.toMatchObject({
      failure: 'not-a-feed',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
