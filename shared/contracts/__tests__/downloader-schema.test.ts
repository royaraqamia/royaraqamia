import { describe, expect, it } from 'vitest';
import { CreateDownloadJobSchema, DOWNLOAD_FORMATS } from '../downloader';

describe('CreateDownloadJobSchema', () => {
  it('accepts an http(s) link with a known format', () => {
    const result = CreateDownloadJobSchema.safeParse({
      url: 'https://example.com/watch?v=1',
      format: 'video-720p',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a non-http scheme', () => {
    const result = CreateDownloadJobSchema.safeParse({
      url: 'ftp://example.com/a.mp4',
      format: 'video-720p',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an unknown format', () => {
    const result = CreateDownloadJobSchema.safeParse({
      url: 'https://example.com/a.mp4',
      format: 'video-4k',
    });

    expect(result.success).toBe(false);
  });

  it('exposes audio and the three video tiers as the only formats', () => {
    expect(DOWNLOAD_FORMATS).toEqual(['audio', 'video-360p', 'video-720p', 'video-1080p']);
  });
});
