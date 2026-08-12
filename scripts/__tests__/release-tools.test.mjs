import { describe, it, expect } from 'vitest';
import {
  parseTag,
  formatTag,
  nextVersion,
  isBreakingCommit,
  isFeatCommit,
  isReleaseCommit,
  shouldSkipRelease,
  stripType,
  groupCommits,
  changelogSection,
} from '../release-tools.mjs';

describe('release-tools', () => {
  describe('parseTag / formatTag', () => {
    it('parses a bare version', () => {
      expect(parseTag('1.4.1')).toEqual({ major: 1, minor: 4, patch: 1 });
    });

    it('parses a v-prefixed tag', () => {
      expect(parseTag('v1.4.1')).toEqual({ major: 1, minor: 4, patch: 1 });
    });

    it('returns null for non-semver input', () => {
      expect(parseTag('not-a-version')).toBeNull();
      expect(parseTag('v1.4')).toBeNull();
      expect(parseTag(null)).toBeNull();
    });

    it('formats a version back to a string', () => {
      expect(formatTag({ major: 2, minor: 0, patch: 5 })).toBe('2.0.5');
    });
  });

  describe('nextVersion', () => {
    it('bumps major on a breaking change', () => {
      expect(nextVersion('1.4.1', 'feat!: drop v1 api')).toEqual({ major: 2, minor: 0, patch: 0 });
      expect(nextVersion('1.4.1', 'fix(api): change response\n\nBREAKING CHANGE: removed')).toEqual(
        {
          major: 2,
          minor: 0,
          patch: 0,
        }
      );
    });

    it('bumps minor on a feature', () => {
      expect(nextVersion('1.4.1', 'feat(blog): add drafts')).toEqual({
        major: 1,
        minor: 5,
        patch: 0,
      });
    });

    it('bumps patch on anything else', () => {
      expect(nextVersion('1.4.1', 'fix: typo on landing')).toEqual({
        major: 1,
        minor: 4,
        patch: 2,
      });
      expect(nextVersion('1.4.1', 'chore: update')).toEqual({ major: 1, minor: 4, patch: 2 });
      expect(nextVersion('1.4.1', 'random message')).toEqual({ major: 1, minor: 4, patch: 2 });
    });

    it('starts from 0.0.0 when no tag exists', () => {
      expect(nextVersion(null, 'feat: init')).toEqual({ major: 0, minor: 1, patch: 0 });
      expect(nextVersion(null, 'chore: init')).toEqual({ major: 0, minor: 0, patch: 1 });
    });

    it('does not treat a breaking-feat commit as a normal feat', () => {
      expect(isFeatCommit('feat!: breaking')).toBe(false);
      expect(isBreakingCommit('feat!: breaking')).toBe(true);
    });
  });

  describe('release-commit detection / idempotency guard', () => {
    it('detects a release commit message', () => {
      expect(isReleaseCommit('chore(release): v1.5.0 [skip ci]')).toBe(true);
      expect(isReleaseCommit('feat(blog): add drafts')).toBe(false);
    });

    it('bails when HEAD is already tagged with a release commit', () => {
      expect(
        shouldSkipRelease({ headMessage: 'chore(release): v1.5.0 [skip ci]', headTag: 'v1.5.0' })
      ).toBe(true);
    });

    it('proceeds when HEAD is not a tagged release commit', () => {
      expect(shouldSkipRelease({ headMessage: 'feat(blog): add drafts', headTag: 'v1.4.1' })).toBe(
        false
      );
      expect(shouldSkipRelease({ headMessage: 'chore(release): v1.5.0', headTag: null })).toBe(
        false
      );
    });
  });

  describe('changelog', () => {
    it('strips the conventional prefix', () => {
      expect(stripType('feat(blog): add drafts')).toBe('add drafts');
      expect(stripType('fix: typo')).toBe('typo');
      expect(stripType('plain message')).toBe('plain message');
    });

    it('groups commits by conventional type', () => {
      const groups = groupCommits([
        'feat(blog): add drafts',
        'fix: typo on landing',
        'perf(ui): lazy-load charts',
        'chore: update',
        'plain message',
      ]);
      expect(groups.Added).toEqual(['add drafts']);
      expect(groups.Fixed).toEqual(['typo on landing']);
      expect(groups.Changed).toContain('lazy-load charts');
      expect(groups.Changed).toContain('update');
      expect(groups.Changed).toContain('plain message');
    });

    it('produces a dated Keep-a-Changelog section', () => {
      const section = changelogSection({ major: 1, minor: 5, patch: 0 }, '2026-08-12', [
        'feat: add drafts',
      ]);
      expect(section).toContain('## [1.5.0] - 2026-08-12');
      expect(section).toContain('### Added');
      expect(section).toContain('add drafts');
    });

    it('omits empty sections', () => {
      const section = changelogSection({ major: 1, minor: 5, patch: 0 }, '2026-08-12', []);
      expect(section).not.toContain('### Added');
      expect(section).toContain('## [1.5.0] - 2026-08-12');
    });
  });
});
