import { describe, it, expect } from 'vitest';
import {
  parseTag,
  formatTag,
  nextVersion,
  nextVersionFromMessages,
  isBreakingCommit,
  isFeatCommit,
  isReleaseCommit,
  shouldSkipRelease,
  stripType,
  groupCommits,
  changelogSection,
  applyLockfileVersion,
  gradeWindows,
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

  describe('nextVersionFromMessages', () => {
    it('bumps minor when any commit in the range is a feat, even if the tip is cosmetic', () => {
      const messages = [
        'feat(push): add native push notifications',
        'fix(push): harden webhook fan-out',
        'style: apply prettier formatting',
      ];
      expect(nextVersionFromMessages('1.4.1', messages)).toEqual({
        major: 1,
        minor: 5,
        patch: 0,
      });
    });

    it('bumps major when any commit in the range is breaking', () => {
      const messages = ['feat(push): add feature', 'fix!: remove legacy api', 'chore: tidy'];
      expect(nextVersionFromMessages('1.4.1', messages)).toEqual({
        major: 2,
        minor: 0,
        patch: 0,
      });
    });

    it('bumps patch when no commit is a feat or breaking change', () => {
      const messages = [
        'style: apply prettier formatting',
        'fix: typo on landing',
        'chore: update',
      ];
      expect(nextVersionFromMessages('1.4.1', messages)).toEqual({
        major: 1,
        minor: 4,
        patch: 2,
      });
    });

    it('bumps patch on an empty range (nothing new to release)', () => {
      expect(nextVersionFromMessages('1.4.1', [])).toEqual({ major: 1, minor: 4, patch: 2 });
    });

    it('starts from 0.1.0 when no tag exists and a feat is present', () => {
      expect(nextVersionFromMessages(null, ['feat: init', 'style: tidy'])).toEqual({
        major: 0,
        minor: 1,
        patch: 0,
      });
    });
  });

  describe('gradeWindows (replay audit core)', () => {
    const tags = [
      { tag: 'v1.0.0', version: { major: 1, minor: 0, patch: 0 } },
      { tag: 'v1.0.1', version: { major: 1, minor: 0, patch: 1 } },
      { tag: 'v1.0.2', version: { major: 1, minor: 0, patch: 2 } },
    ];
    const noMessages = () => [];

    it('grades each window and accumulates the version', () => {
      const readMessages = (from, to) =>
        from === 'v1.0.0' && to === 'v1.0.1'
          ? ['feat: add push notifications', 'style: prettier']
          : from === 'v1.0.1' && to === 'v1.0.2'
            ? ['fix: typo', 'chore: tidy']
            : [];
      const { windows, final } = gradeWindows(tags, readMessages);
      expect(windows).toHaveLength(2);
      expect(windows[0].version).toEqual({ major: 1, minor: 1, patch: 0 });
      expect(windows[1].version).toEqual({ major: 1, minor: 1, patch: 1 });
      expect(final).toEqual({ major: 1, minor: 1, patch: 1 });
    });

    it('skips an empty trailing window after the last tag', () => {
      const { windows, final } = gradeWindows(tags, noMessages);
      expect(windows).toHaveLength(2);
      expect(final).toEqual({ major: 1, minor: 0, patch: 2 });
    });

    it('grades from 0.0.0 when no tags exist', () => {
      const readMessages = () => ['feat: init'];
      const { windows, final } = gradeWindows([], readMessages);
      expect(windows).toHaveLength(1);
      expect(windows[0].from).toBeNull();
      expect(final).toEqual({ major: 0, minor: 1, patch: 0 });
    });

    it('bumps major when a window contains a breaking change', () => {
      const readMessages = (from, to) =>
        from === 'v1.0.0' && to === 'v1.0.1'
          ? ['fix!: remove legacy api']
          : from === 'v1.0.1' && to === 'v1.0.2'
            ? ['chore: tidy']
            : [];
      const { final } = gradeWindows(tags, readMessages);
      expect(final).toEqual({ major: 2, minor: 0, patch: 1 });
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

  describe('lockfile version sync', () => {
    it('updates the root version of the lockfile', () => {
      const lock = { version: '1.0.0', packages: { '': { version: '1.0.0' } } };
      applyLockfileVersion(lock, '1.0.1');
      expect(lock.version).toBe('1.0.1');
      expect(lock.packages[''].version).toBe('1.0.1');
    });

    it('tolerates a lockfile without the root package entry', () => {
      const lock = { version: '1.0.0', packages: {} };
      applyLockfileVersion(lock, '2.0.0');
      expect(lock.version).toBe('2.0.0');
      expect(lock.packages['']).toBeUndefined();
    });
  });
});
