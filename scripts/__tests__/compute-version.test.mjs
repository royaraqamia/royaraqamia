import { describe, it, expect } from 'vitest';
import { resolveReleaseVersion } from '../compute-version.mjs';

describe('compute-version', () => {
  it('produces +build.0.<sha> when HEAD is exactly the tag', () => {
    const result = resolveReleaseVersion({
      appVersionOverride: undefined,
      packageVersion: '1.4.1',
      commitSha: '3f9a1b2',
      count: 0,
    });
    expect(result.releaseVersion).toBe('1.4.1+build.0.3f9a1b2');
    expect(result.semver).toBe('1.4.1');
  });

  it('counts commits since the last tag', () => {
    const result = resolveReleaseVersion({
      appVersionOverride: undefined,
      packageVersion: '1.4.0',
      commitSha: 'abc1234',
      count: 7,
    });
    expect(result.releaseVersion).toBe('1.4.0+build.7.abc1234');
  });

  it('honours the APP_VERSION override', () => {
    const result = resolveReleaseVersion({
      appVersionOverride: '9.0.0',
      packageVersion: '1.4.1',
      commitSha: 'zzz9999',
      count: 3,
    });
    expect(result.releaseVersion).toBe('9.0.0+build.3.zzz9999');
  });

  it('falls back to unknown when no git context exists', () => {
    const result = resolveReleaseVersion({
      appVersionOverride: undefined,
      packageVersion: '1.0.0',
      commitSha: undefined,
      count: 0,
    });
    expect(result.releaseVersion).toBe('1.0.0+build.0.unknown');
    expect(result.commit).toBe('unknown');
  });

  it('truncates the sha to 7 characters', () => {
    const result = resolveReleaseVersion({
      appVersionOverride: undefined,
      packageVersion: '1.0.0',
      commitSha: 'abcdef123456789',
      count: 0,
    });
    expect(result.releaseVersion).toBe('1.0.0+build.0.abcdef1');
  });

  it('always returns a valid releasedAt date', () => {
    const result = resolveReleaseVersion({
      appVersionOverride: undefined,
      packageVersion: '1.0.0',
      commitSha: 'aaaaaaa',
      count: 0,
    });
    expect(Number.isNaN(Date.parse(result.releasedAt))).toBe(false);
  });
});
