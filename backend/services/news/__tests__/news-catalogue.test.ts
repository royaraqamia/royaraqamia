import { describe, expect, it } from 'vitest';

import rawSources from '@/data/news/sources.json';
import { hasFileSourceUrl } from '@/backend/services/news/news-catalogue';

/** Every feed URL the shipped file carries, as published. */
const FILE_URLS = (rawSources.sources as { url?: unknown }[]).flatMap((source) =>
  typeof source.url === 'string' ? [source.url] : []
);

function shippedFeed(): URL {
  const value = FILE_URLS[0];
  if (!value) throw new Error('data/news/sources.json carries no feed URL');
  return new URL(value);
}

describe('news catalogue', () => {
  it('knows every feed the file lists, as published', () => {
    for (const url of FILE_URLS) expect(hasFileSourceUrl(url)).toBe(true);
  });

  it('treats a trailing slash as the same feed', () => {
    const feed = shippedFeed();
    const withoutSlash = `${feed.origin}${feed.pathname.replace(/\/+$/, '')}`;

    expect(hasFileSourceUrl(withoutSlash)).toBe(true);
    expect(hasFileSourceUrl(`${withoutSlash}/`)).toBe(true);
  });

  it('treats an uppercase host, a fragment and a default port as the same feed', () => {
    const feed = shippedFeed();
    const port = feed.protocol === 'https:' ? 443 : 80;

    expect(
      hasFileSourceUrl(`${feed.protocol}//${feed.hostname.toUpperCase()}${feed.pathname}`)
    ).toBe(true);
    expect(hasFileSourceUrl(`${feed.origin}${feed.pathname}#latest`)).toBe(true);
    expect(hasFileSourceUrl(`${feed.protocol}//${feed.hostname}:${port}${feed.pathname}`)).toBe(
      true
    );
  });

  it('does not treat another path on the same host as the same feed', () => {
    const feed = shippedFeed();

    expect(hasFileSourceUrl(`${feed.origin}/some-other-feed`)).toBe(false);
  });

  it('does not know a feed the file does not list', () => {
    expect(hasFileSourceUrl('https://example.com/rss')).toBe(false);
  });

  it('does not match something that is not a URL', () => {
    expect(hasFileSourceUrl('not-a-url')).toBe(false);
    expect(hasFileSourceUrl('')).toBe(false);
  });
});
