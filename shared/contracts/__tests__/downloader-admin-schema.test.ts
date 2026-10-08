import { describe, expect, it } from 'vitest';
import {
  AddDownloadBlockSchema,
  DEFAULT_DOWNLOAD_SETTINGS,
  MAX_DOWNLOAD_AUDIO_BYTES,
  MAX_DOWNLOAD_DURATION_SECONDS,
  MAX_DOWNLOAD_VIDEO_BYTES,
  maxDownloadBytes,
  SetDownloadPlatformEnabledSchema,
  UpdateDownloadSettingsSchema,
} from '../downloader';

describe('AddDownloadBlockSchema', () => {
  it('accepts and lowercases a domain', () => {
    const result = AddDownloadBlockSchema.safeParse({ kind: 'domain', value: '  Example.COM ' });

    expect(result.success).toBe(true);
    expect(result.success && result.data.value).toBe('example.com');
  });

  it('rejects a malformed domain', () => {
    expect(
      AddDownloadBlockSchema.safeParse({ kind: 'domain', value: 'not a domain' }).success
    ).toBe(false);
    expect(AddDownloadBlockSchema.safeParse({ kind: 'domain', value: 'localhost' }).success).toBe(
      false
    );
  });

  it('accepts an http(s) url and rejects other schemes', () => {
    expect(
      AddDownloadBlockSchema.safeParse({ kind: 'url', value: 'https://example.com/a' }).success
    ).toBe(true);
    expect(
      AddDownloadBlockSchema.safeParse({ kind: 'url', value: 'ftp://example.com/a' }).success
    ).toBe(false);
  });

  it('rejects an unknown kind', () => {
    expect(AddDownloadBlockSchema.safeParse({ kind: 'email', value: 'a@b.com' }).success).toBe(
      false
    );
  });
});

describe('SetDownloadPlatformEnabledSchema', () => {
  it('requires a boolean', () => {
    expect(SetDownloadPlatformEnabledSchema.safeParse({ enabled: false }).success).toBe(true);
    expect(SetDownloadPlatformEnabledSchema.safeParse({ enabled: 'yes' }).success).toBe(false);
  });
});

describe('UpdateDownloadSettingsSchema', () => {
  it('accepts a single tunable field', () => {
    expect(UpdateDownloadSettingsSchema.safeParse({ maxConcurrentJobs: 5 }).success).toBe(true);
  });

  it('rejects an empty update', () => {
    expect(UpdateDownloadSettingsSchema.safeParse({}).success).toBe(false);
  });

  it('rejects out-of-range values', () => {
    expect(UpdateDownloadSettingsSchema.safeParse({ maxDurationSeconds: 5 }).success).toBe(false);
    expect(UpdateDownloadSettingsSchema.safeParse({ maxConcurrentJobs: 0 }).success).toBe(false);
    expect(UpdateDownloadSettingsSchema.safeParse({ linkTtlSeconds: 1 }).success).toBe(false);
  });

  it('rejects non-integer values', () => {
    expect(UpdateDownloadSettingsSchema.safeParse({ maxDurationSeconds: 90.5 }).success).toBe(
      false
    );
  });
});

describe('DownloadSettings defaults and caps', () => {
  it('mirrors the hard defaults', () => {
    expect(DEFAULT_DOWNLOAD_SETTINGS).toMatchObject({
      maxDurationSeconds: MAX_DOWNLOAD_DURATION_SECONDS,
      maxAudioBytes: MAX_DOWNLOAD_AUDIO_BYTES,
      maxVideoBytes: MAX_DOWNLOAD_VIDEO_BYTES,
    });
  });

  it('reads the size cap from the supplied settings', () => {
    const caps = {
      maxDurationSeconds: 60,
      maxAudioBytes: 1024,
      maxVideoBytes: 4096,
    };
    expect(maxDownloadBytes('audio', caps)).toBe(1024);
    expect(maxDownloadBytes('video-720p', caps)).toBe(4096);
  });
});
