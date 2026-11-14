import { describe, it, expect } from 'vitest';
import {
  resolveBuildIdentity,
  resolveReleaseVersion,
  shouldWriteAppVersion,
} from '../compute-version.mjs';

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

describe('shouldWriteAppVersion', () => {
  it('skips the write for plain local runs', () => {
    expect(shouldWriteAppVersion({})).toBe(false);
  });

  it('writes on GitHub Actions (CI=true)', () => {
    expect(shouldWriteAppVersion({ CI: 'true' })).toBe(true);
  });

  it('writes when CI=1', () => {
    expect(shouldWriteAppVersion({ CI: '1' })).toBe(true);
  });

  it('writes on Vercel builds (VERCEL=1)', () => {
    expect(shouldWriteAppVersion({ VERCEL: '1' })).toBe(true);
  });

  it('writes on Render builds (RENDER=true)', () => {
    expect(shouldWriteAppVersion({ RENDER: 'true' })).toBe(true);
  });

  it('writes when Vercel build metadata exists', () => {
    expect(shouldWriteAppVersion({ VERCEL_GIT_COMMIT_SHA: 'abc1234' })).toBe(true);
    expect(shouldWriteAppVersion({ VERCEL_ENV: 'production' })).toBe(true);
  });

  it('APP_VERSION_WRITE=force forces a local write', () => {
    expect(shouldWriteAppVersion({ APP_VERSION_WRITE: 'force' })).toBe(true);
  });

  it('APP_VERSION_WRITE=skip overrides CI detection', () => {
    expect(shouldWriteAppVersion({ APP_VERSION_WRITE: 'skip', CI: 'true' })).toBe(false);
  });
});

describe('resolveBuildIdentity', () => {
  it('prefers Render metadata over the local checkout', () => {
    const identity = resolveBuildIdentity({
      env: {
        RENDER: 'true',
        RENDER_GIT_COMMIT: 'abc1234def',
        RENDER_GIT_BRANCH: 'main',
      },
      commitFromGit: '9999999',
      refFromGit: 'opencode/dispatch-stale',
    });
    expect(identity).toEqual({
      commit: 'abc1234def',
      ref: 'main',
      env: 'production',
    });
  });

  it('reads the checkout when no build host provided metadata', () => {
    const identity = resolveBuildIdentity({
      env: {},
      commitFromGit: 'abc1234',
      refFromGit: 'fix/1466-render-build-identity',
    });
    expect(identity).toEqual({
      commit: 'abc1234',
      ref: 'fix/1466-render-build-identity',
      env: 'development',
    });
  });

  it('keeps the Vercel metadata reading it had before Render existed', () => {
    const identity = resolveBuildIdentity({
      env: {
        VERCEL_GIT_COMMIT_SHA: 'abc1234',
        VERCEL_GIT_COMMIT_REF: 'main',
        VERCEL_ENV: 'preview',
      },
      commitFromGit: '9999999',
      refFromGit: 'local',
    });
    expect(identity).toEqual({ commit: 'abc1234', ref: 'main', env: 'preview' });
  });

  it('answers unknown rather than an empty ref when git has no branch', () => {
    expect(resolveBuildIdentity({ env: {}, commitFromGit: '', refFromGit: '' })).toEqual({
      commit: '',
      ref: 'unknown',
      env: 'development',
    });
  });
});
