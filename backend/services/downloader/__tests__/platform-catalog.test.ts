import { describe, expect, it } from 'vitest';
import {
  DOWNLOAD_PLATFORMS,
  findPlatform,
  platformForUrl,
  platformIdForUrl,
} from '@/backend/services/downloader/platform-catalog';

describe('platformForUrl', () => {
  it.each([
    ['https://www.youtube.com/watch?v=abc', 'youtube'],
    ['https://youtube.com/watch?v=abc', 'youtube'],
    ['https://youtu.be/abc', 'youtube'],
    ['https://m.youtube.com/watch?v=abc', 'youtube'],
    ['https://vm.tiktok.com/abc', 'tiktok'],
    ['https://x.com/u/status/1', 'twitter'],
    ['https://www.facebook.com/watch/1', 'facebook'],
    ['https://fb.watch/abc', 'facebook'],
  ])('maps %s to %s', (url, id) => {
    expect(platformIdForUrl(url)).toBe(id);
  });

  it('treats an unlisted host as generic', () => {
    expect(platformForUrl('https://example.com/v/1')).toBeNull();
    expect(platformForUrl('https://some-blog.dev/post')).toBeNull();
  });

  it('does not match a lookalike domain', () => {
    expect(platformForUrl('https://notyoutube.com/watch')).toBeNull();
    expect(platformForUrl('https://youtube.com.evil.test/watch')).toBeNull();
  });

  it('returns null for an unparsable url', () => {
    expect(platformForUrl('not a url')).toBeNull();
  });
});

describe('DOWNLOAD_PLATFORMS catalogue', () => {
  it('gives every Platform a unique id, a name and at least one domain', () => {
    const ids = new Set<string>();
    for (const platform of DOWNLOAD_PLATFORMS) {
      expect(platform.id).toMatch(/^[a-z0-9-]+$/);
      expect(platform.name.length).toBeGreaterThan(0);
      expect(platform.domains.length).toBeGreaterThan(0);
      expect(ids.has(platform.id)).toBe(false);
      ids.add(platform.id);
    }
  });

  it('enables every Platform by default (ADR-0020)', () => {
    expect(DOWNLOAD_PLATFORMS.every((platform) => platform.enabledByDefault)).toBe(true);
  });

  it('finds a Platform by id', () => {
    expect(findPlatform('youtube')?.name).toBe('YouTube');
    expect(findPlatform('does-not-exist')).toBeNull();
  });
});
