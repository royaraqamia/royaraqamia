import { describe, expect, it } from 'vitest';
import {
  CreateDownloadJobSchema,
  DownloadCallbackSchema,
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

describe('DownloadCallbackSchema', () => {
  const jobId = '11111111-1111-4111-8111-111111111111';

  it('accepts a ready result with a signed file', () => {
    const result = DownloadCallbackSchema.safeParse({
      jobId,
      status: 'ready',
      platform: 'example.com',
      durationSeconds: 12,
      file: {
        url: 'https://media.example.com/x.mp4',
        filename: 'x.mp4',
        sizeBytes: 10,
        expiresAt: '2030-01-01T00:00:00.000Z',
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts a failed result with a reason', () => {
    const result = DownloadCallbackSchema.safeParse({
      jobId,
      status: 'failed',
      error: 'هذا الرابط غير مدعوم.',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a ready result with no file', () => {
    const result = DownloadCallbackSchema.safeParse({ jobId, status: 'ready', durationSeconds: 1 });

    expect(result.success).toBe(false);
  });

  it('rejects a failed result with no reason', () => {
    const result = DownloadCallbackSchema.safeParse({ jobId, status: 'failed' });

    expect(result.success).toBe(false);
  });

  it('rejects an unknown status and a non-uuid job', () => {
    expect(DownloadCallbackSchema.safeParse({ jobId, status: 'queued' }).success).toBe(false);
    expect(
      DownloadCallbackSchema.safeParse({ jobId: 'nope', status: 'failed', error: 'x' }).success
    ).toBe(false);
  });
});
