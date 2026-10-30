import { describe, expect, it, vi } from 'vitest';

import { isPublicHttpUrl as contractIsPublicHttpUrl } from '@/shared/network';
import {
  classifySourceUrl,
  discoverFeed,
  fetchPage,
  findAdvertisedFeeds,
  isPublicHttpUrl,
  isPublicIpAddress,
  isTelegramPreview,
  looksLikeFeed,
  resolveSourceUrl,
  youtubeChannelIdFromPage,
} from '../news/resolve-source.mjs';
import { answerFor } from '../news/resolve-source-requests.mjs';

/** A page that only advertises its feed — the shape the reader usually pastes. */
const PAGE = `<!doctype html>
<html><head>
  <link type="application/rss+xml" href="/feed.xml" rel="alternate">
</head><body>not a feed</body></html>`;

const FEED = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel><title>مثال</title>
<item><title>خبر</title><link>https://example.com/1</link></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>مثال</title>
<entry><title>خبر</title><link href="https://example.com/1"/></entry></feed>`;

const YOUTUBE_PAGE = `<!doctype html><html><head></head><body>
<script>var ytInitialData = {"metadata":{"channelMetadataRenderer":{"externalId":"UCfiwzLy-8yKzIbsmZTzxDgw"}}};</script>
</body></html>`;

const TELEGRAM_PREVIEW = `<!doctype html><html><body>
<div class="tgme_channel_info">قناة دليل</div>
<div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="example/12">
  <div class="tgme_widget_message_text">خبرٌ عاجل<br/>تفصيلٌ أوّل</div>
  <a href="https://t.me/example/12"><time datetime="2026-10-30T06:00:00+00:00">06:00</time></a>
</div></div>
</body></html>`;

/** A transport where `routes` maps an exact URL to a body, or to an Error. */
function transport(routes) {
  const fetchPageImpl = vi.fn(async (url) => {
    const hit = routes[url];
    if (hit === undefined) throw new Error(`HTTP 404 (${url})`);
    if (hit instanceof Error) throw hit;
    return { text: hit, finalUrl: url };
  });
  return fetchPageImpl;
}

describe('classifying a pasted URL', () => {
  it('treats a plain page as something to look for a feed on', () => {
    expect(classifySourceUrl('https://example.com/news')).toEqual({
      kind: 'feed',
      url: 'https://example.com/news',
    });
  });

  it('recognises a YouTube channel id without a page read', () => {
    expect(classifySourceUrl('https://youtube.com/channel/UCfiwzLy-8yKzIbsmZTzxDgw')).toEqual({
      kind: 'youtube-channel',
      channelId: 'UCfiwzLy-8yKzIbsmZTzxDgw',
    });
  });

  it('recognises a YouTube handle, a custom name and a video', () => {
    expect(classifySourceUrl('https://www.youtube.com/@aljazeera')).toEqual({
      kind: 'youtube-handle',
      handle: '@aljazeera',
    });
    expect(classifySourceUrl('https://youtube.com/c/aljazeera')).toEqual({
      kind: 'youtube-handle',
      handle: 'aljazeera',
    });
    expect(classifySourceUrl('https://youtu.be/dQw4w9WgXcQ')).toEqual({ kind: 'youtube-video' });
    expect(classifySourceUrl('https://youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      kind: 'youtube-video',
    });
  });

  it('recognises a Telegram channel, including the preview URL itself', () => {
    expect(classifySourceUrl('https://t.me/example')).toEqual({
      kind: 'telegram',
      channel: 'example',
    });
    expect(classifySourceUrl('https://t.me/s/example')).toEqual({
      kind: 'telegram',
      channel: 'example',
    });
    expect(classifySourceUrl('https://telegram.me/example')).toEqual({
      kind: 'telegram',
      channel: 'example',
    });
  });

  it('refuses the Telegram links that are not a channel', () => {
    expect(classifySourceUrl('https://t.me/+abc123')).toEqual({
      kind: 'unsupported',
      platform: 'telegram',
    });
    expect(classifySourceUrl('https://t.me/share/url?url=x')).toEqual({
      kind: 'unsupported',
      platform: 'telegram',
    });
  });

  it('names the platforms that have no free public read', () => {
    for (const url of [
      'https://www.facebook.com/example',
      'https://fb.com/example',
      'https://x.com/example',
      'https://twitter.com/example',
      'https://www.instagram.com/example',
    ]) {
      expect(classifySourceUrl(url)).toMatchObject({ kind: 'unsupported' });
    }
  });

  it('rejects anything that is not an http(s) URL', () => {
    expect(classifySourceUrl('not-a-url')).toEqual({ kind: 'invalid' });
    expect(classifySourceUrl('ftp://example.com/feed')).toEqual({ kind: 'invalid' });
  });
});

describe('the public-target guard', () => {
  // The same expectations as `shared/network.ts`, asserted against both: the
  // script cannot import the TypeScript module, so this is what keeps the two
  // definitions from drifting into an SSRF.
  const corpus = [
    'https://example.com/rss',
    'https://www.aljazeera.net/feed',
    'http://127.0.0.1/feed',
    'http://localhost:3000/feed',
    'http://10.0.0.1/feed',
    'http://192.168.1.1/feed',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/feed',
    'http://[::ffff:127.0.0.1]/feed',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'https://internal.localhost/feed',
    'https://0.0.0.0/feed',
  ];

  it('agrees with shared/network.ts on every case', () => {
    for (const url of corpus) {
      expect(isPublicHttpUrl(url)).toBe(contractIsPublicHttpUrl(url));
    }
  });

  it('classifies resolved addresses the way the contract does', () => {
    expect(isPublicIpAddress('93.184.216.34')).toBe(true);
    expect(isPublicIpAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(true);
    expect(isPublicIpAddress('127.0.0.1')).toBe(false);
    expect(isPublicIpAddress('10.1.2.3')).toBe(false);
    expect(isPublicIpAddress('::1')).toBe(false);
    expect(isPublicIpAddress('fd00::1')).toBe(false);
    expect(isPublicIpAddress('fe80::1')).toBe(false);
    expect(isPublicIpAddress('not-an-address')).toBe(false);
  });

  it('refuses a host that resolves to a private address before fetching', async () => {
    const fetchImpl = vi.fn();
    const resolveHost = vi.fn(async () => [{ address: '127.0.0.1', family: 4 }]);

    await expect(
      fetchPage('https://looks-public.example/feed', { fetchImpl, resolveHost })
    ).rejects.toThrow('private address');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a redirect into a private address', async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 302,
      headers: new Headers({ location: 'http://169.254.169.254/latest' }),
      ok: false,
    }));
    const resolveHost = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]);

    await expect(fetchPage('https://example.com/feed', { fetchImpl, resolveHost })).rejects.toThrow(
      'not a public target'
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('finding a feed', () => {
  it('accepts an RSS document and an Atom document', () => {
    expect(looksLikeFeed(FEED)).toBe(true);
    expect(looksLikeFeed(ATOM)).toBe(true);
  });

  it('does not mistake a page that links a feed for a feed', () => {
    expect(looksLikeFeed(PAGE)).toBe(false);
    expect(looksLikeFeed('')).toBe(false);
  });

  it('reads a feed advertisement whatever order the attributes are in', () => {
    expect(findAdvertisedFeeds(PAGE, 'https://example.com/news')).toEqual([
      'https://example.com/feed.xml',
    ]);
    expect(
      findAdvertisedFeeds(
        '<link rel="alternate" type="application/atom+xml" href="https://example.com/atom">',
        'https://example.com/'
      )
    ).toEqual(['https://example.com/atom']);
  });

  it('ignores a link that is not a feed type or not a public target', () => {
    expect(
      findAdvertisedFeeds(
        '<link rel="stylesheet" type="text/css" href="/a.css">' +
          '<link rel="alternate" type="application/rss+xml" href="http://127.0.0.1/feed">',
        'https://example.com/'
      )
    ).toEqual([]);
  });

  it('returns the pasted URL when it already is a feed', async () => {
    const fetchPageImpl = transport({ 'https://example.com/rss': FEED });
    await expect(discoverFeed('https://example.com/rss', { fetchPageImpl })).resolves.toBe(
      'https://example.com/rss'
    );
  });

  it('follows the page advertisement before guessing well-known paths', async () => {
    const fetchPageImpl = transport({
      'https://example.com/news': PAGE,
      'https://example.com/feed.xml': FEED,
    });

    await expect(discoverFeed('https://example.com/news', { fetchPageImpl })).resolves.toBe(
      'https://example.com/feed.xml'
    );
  });

  it('falls back to a well-known path, and gives up cleanly', async () => {
    const fetchPageImpl = transport({
      'https://example.com/news': '<html><head></head><body>hello</body></html>',
      'https://example.com/rss': FEED,
    });

    await expect(discoverFeed('https://example.com/news', { fetchPageImpl })).resolves.toBe(
      'https://example.com/rss'
    );

    const nothing = transport({ 'https://example.com/news': '<html><body>hello</body></html>' });
    await expect(
      discoverFeed('https://example.com/news', { fetchPageImpl: nothing })
    ).resolves.toBeNull();
  });

  it('skips an advertisement that does not answer with a feed', async () => {
    const fetchPageImpl = transport({
      'https://example.com/news': PAGE,
      'https://example.com/feed.xml': '<html><body>gone</body></html>',
      'https://example.com/feed': FEED,
    });

    await expect(discoverFeed('https://example.com/news', { fetchPageImpl })).resolves.toBe(
      'https://example.com/feed'
    );
  });
});

describe('resolving a source', () => {
  it('answers a page with the feed it publishes', async () => {
    const fetchPageImpl = transport({
      'https://example.com/news': PAGE,
      'https://example.com/feed.xml': FEED,
    });

    await expect(resolveSourceUrl('https://example.com/news', { fetchPageImpl })).resolves.toEqual({
      kind: 'feed',
      url: 'https://example.com/feed.xml',
    });
  });

  it('answers a YouTube channel id with the channel feed, without reading the page', async () => {
    const fetchPageImpl = transport({
      'https://www.youtube.com/feeds/videos.xml?channel_id=UCfiwzLy-8yKzIbsmZTzxDgw': FEED,
    });

    await expect(
      resolveSourceUrl('https://youtube.com/channel/UCfiwzLy-8yKzIbsmZTzxDgw', { fetchPageImpl })
    ).resolves.toEqual({
      kind: 'feed',
      url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCfiwzLy-8yKzIbsmZTzxDgw',
    });
    expect(fetchPageImpl).toHaveBeenCalledTimes(1);
  });

  it('resolves a YouTube handle through the channel id its page carries', async () => {
    const fetchPageImpl = transport({
      'https://www.youtube.com/@example': YOUTUBE_PAGE,
      'https://www.youtube.com/feeds/videos.xml?channel_id=UCfiwzLy-8yKzIbsmZTzxDgw': FEED,
    });

    await expect(
      resolveSourceUrl('https://www.youtube.com/@example', { fetchPageImpl })
    ).resolves.toEqual({
      kind: 'feed',
      url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCfiwzLy-8yKzIbsmZTzxDgw',
    });
    expect(youtubeChannelIdFromPage(YOUTUBE_PAGE)).toBe('UCfiwzLy-8yKzIbsmZTzxDgw');
  });

  it('answers a Telegram channel with its public preview', async () => {
    const fetchPageImpl = transport({ 'https://t.me/s/example': TELEGRAM_PREVIEW });

    await expect(resolveSourceUrl('https://t.me/example', { fetchPageImpl })).resolves.toEqual({
      kind: 'telegram',
      url: 'https://t.me/s/example',
    });
    expect(isTelegramPreview(TELEGRAM_PREVIEW)).toBe(true);
  });

  it('marks a channel without a public preview as unreachable', async () => {
    const fetchPageImpl = transport({
      'https://t.me/s/example': '<html><body>Please open Telegram to view this post</body></html>',
    });

    await expect(
      resolveSourceUrl('https://t.me/example', { fetchPageImpl })
    ).resolves.toMatchObject({ failure: 'unreachable' });
  });

  it('answers Facebook, X and Instagram without fetching at all', async () => {
    const fetchPageImpl = transport({});

    for (const url of [
      'https://facebook.com/example',
      'https://x.com/example',
      'https://instagram.com/example',
    ]) {
      await expect(resolveSourceUrl(url, { fetchPageImpl })).resolves.toMatchObject({
        failure: 'unsupported',
      });
    }
    expect(fetchPageImpl).not.toHaveBeenCalled();
  });

  it('answers a page with no feed as needing review', async () => {
    const fetchPageImpl = transport({
      'https://example.com/news': '<html><body>no feed here</body></html>',
    });

    await expect(
      resolveSourceUrl('https://example.com/news', { fetchPageImpl })
    ).resolves.toMatchObject({ failure: 'no-feed' });
  });

  it('answers an unreachable host as unreachable, not as a crash', async () => {
    const fetchPageImpl = transport({ 'https://example.com/news': new Error('ECONNREFUSED') });

    await expect(resolveSourceUrl('https://example.com/news', { fetchPageImpl })).resolves.toEqual({
      failure: 'unreachable',
      detail: 'ECONNREFUSED',
    });
  });
});

describe('writing the answer', () => {
  it('moves an unconvertible row to needs_review with the reason', () => {
    const patch = answerFor(
      { attempts: 0 },
      { failure: 'unsupported', detail: 'facebook: no free public feed' }
    );

    expect(patch).toMatchObject({
      status: 'needs_review',
      failure: 'unsupported',
      failure_detail: 'facebook: no free public feed',
      attempts: 1,
    });
  });

  it('records a plan refusal as the reason the row needs a person', () => {
    const patch = answerFor(
      { attempts: 2 },
      { failure: 'quota', detail: 'the plan private-source cap is reached' }
    );

    expect(patch).toMatchObject({ status: 'needs_review', failure: 'quota', attempts: 3 });
  });
});
