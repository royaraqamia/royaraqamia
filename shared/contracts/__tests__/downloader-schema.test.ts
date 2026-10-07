import { describe, expect, it } from 'vitest';
import {
  CreateDownloadJobSchema,
  DOWNLOAD_FORMATS,
  isPublicHttpUrl,
  MAX_DOWNLOAD_AUDIO_BYTES,
  MAX_DOWNLOAD_DURATION_SECONDS,
  MAX_DOWNLOAD_VIDEO_BYTES,
  maxDownloadBytes,
} from '../downloader';

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

  it('treats the Turnstile token as optional', () => {
    const result = CreateDownloadJobSchema.safeParse({
      url: 'https://example.com/a.mp4',
      format: 'audio',
    });

    expect(result.success).toBe(true);
  });

  it('exposes audio and the three video tiers as the only formats', () => {
    expect(DOWNLOAD_FORMATS).toEqual(['audio', 'video-360p', 'video-720p', 'video-1080p']);
  });
});

describe('isPublicHttpUrl (SSRF guard)', () => {
  it.each([
    'http://localhost/a.mp4',
    'http://127.0.0.1/a.mp4',
    'http://10.1.2.3/a.mp4',
    'http://192.168.1.1/a.mp4',
    'http://172.16.0.1/a.mp4',
    'http://169.254.0.1/a.mp4',
    'http://[::1]/a.mp4',
    'http://[::ffff:127.0.0.1]/a.mp4',
    'file:///etc/passwd',
  ])('rejects %s', (url) => {
    expect(isPublicHttpUrl(url)).toBe(false);
  });

  it('accepts public hosts whose name merely starts with a hex pair', () => {
    expect(isPublicHttpUrl('https://fdic.gov/a.mp4')).toBe(true);
    expect(isPublicHttpUrl('https://fcm.example.com/a.mp4')).toBe(true);
  });

  it('rejects a private literal at the schema', () => {
    const result = CreateDownloadJobSchema.safeParse({
      url: 'http://192.168.1.1/a.mp4',
      format: 'video-720p',
    });
    expect(result.success).toBe(false);
  });
});

describe('download caps', () => {
  it('caps audio and video at different sizes', () => {
    expect(maxDownloadBytes('audio')).toBe(MAX_DOWNLOAD_AUDIO_BYTES);
    expect(maxDownloadBytes('video-1080p')).toBe(MAX_DOWNLOAD_VIDEO_BYTES);
    expect(MAX_DOWNLOAD_DURATION_SECONDS).toBe(15 * 60);
  });
});
