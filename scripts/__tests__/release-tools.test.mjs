import { describe, it, expect } from 'vitest';
import {
  parseTag,
  formatTag,
  formatVersion,
  nextVersion,
  nextVersionFromMessages,
  versionBase,
  normalizeSubject,
  isBreakingCommit,
  isFeatCommit,
  isReleaseCommit,
  shouldSkipRelease,
  stripType,
  groupCommits,
  changelogSection,
  mergeChangelogGroups,
  composeReleaseSection,
  unreleasedRegion,
  unreleasedBody,
  parseChangelogSections,
  countChangelogEntries,
  dropDocumentingCommits,
  applyChangelogSection,
  applyLockfileVersion,
  gradeWindows,
} from '../release-tools.mjs';

const CHANGELOG_FIXTURE = [
  '# Changelog',
  '',
  '## [Unreleased]',
  '',
  '### Fixed',
  "- mint a dedicated Supabase session for each MCP grant instead of copying the browser's",
  '  rotating refresh token, and retire a grant whose bridge session is gone',
  '',
  '## [1.85.2] - 2026-10-12',
  '',
  '### Changed',
  '- drop the diagnostics panel now that the cause is known',
  '',
].join('\n');

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

    it('formats a version as a version and as a tag', () => {
      expect(formatVersion({ major: 2, minor: 0, patch: 5 })).toBe('2.0.5');
      expect(formatTag({ major: 2, minor: 0, patch: 5 })).toBe('web-2.0.5');
    });

    it('parses the current tag spelling too', () => {
      expect(parseTag('web-1.4.1')).toEqual({ major: 1, minor: 4, patch: 1 });
      // And never a shell tag: separate release lines (ADR-0046).
      expect(parseTag('android-1.0.3')).toBeNull();
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

  describe('versionBase (a number that exists is taken)', () => {
    it('counts from the higher of the reachable tag and the highest tag that exists', () => {
      expect(versionBase('web-1.101.12', 'web-1.101.13')).toBe('web-1.101.13');
      expect(versionBase('web-1.101.13', 'web-1.101.12')).toBe('web-1.101.13');
      expect(versionBase('web-1.101.12', 'web-1.4.0')).toBe('web-1.101.12');
    });

    it('cuts the next release above a tag whose commit never reached main', () => {
      // web-1.101.13 was pushed without its commit (the stranded tag of
      // ADR-0051): the last tag on HEAD is 1.101.12 and the window holds a feat,
      // so the next release is 1.102.0 — not 1.101.13 again, which is the
      // collision that failed every run.
      const base = versionBase('web-1.101.12', 'web-1.101.13');
      expect(
        nextVersionFromMessages(base, ['feat(nav): give secondary pages a back header'])
      ).toEqual({ major: 1, minor: 102, patch: 0 });
      expect(nextVersionFromMessages(base, ['fix(mcp): sweep authorization codes'])).toEqual({
        major: 1,
        minor: 101,
        patch: 14,
      });
    });

    it('falls back to whichever side is present', () => {
      expect(versionBase(null, 'web-1.101.13')).toBe('web-1.101.13');
      expect(versionBase('web-1.101.12', null)).toBe('web-1.101.12');
      expect(versionBase(null, null)).toBeNull();
    });

    it('ignores a claimed tag that is not this release line', () => {
      // The shell's tags are a separate clock, and a non-semver tag is not a
      // version at all (ADR-0046).
      expect(versionBase('web-1.101.12', 'android-1.0.4')).toBe('web-1.101.12');
      expect(versionBase('web-1.101.12', 'backup-1')).toBe('web-1.101.12');
    });
  });

  describe('normalizeSubject', () => {
    it('drops the invisible prefix a squash merge can leave behind', () => {
      expect(normalizeSubject('\uFEFFfeat(nav): a back header')).toBe('feat(nav): a back header');
      expect(normalizeSubject('\u200Bfix: a typo')).toBe('fix: a typo');
      expect(normalizeSubject('feat: already clean')).toBe('feat: already clean');
      expect(normalizeSubject(undefined)).toBe('');
    });

    it('grades and groups a BOM-prefixed feat as the feature it is', () => {
      const subject =
        '\uFEFFfeat(nav): give secondary pages a back header, not the app chrome (#277)';
      expect(isFeatCommit(subject)).toBe(true);
      expect(nextVersionFromMessages('1.101.12', [subject])).toEqual({
        major: 1,
        minor: 102,
        patch: 0,
      });
      expect(stripType(subject)).toBe(
        'give secondary pages a back header, not the app chrome (#277)'
      );
      expect(groupCommits([subject]).Added).toEqual([
        'give secondary pages a back header, not the app chrome (#277)',
      ]);
    });

    it('still recognizes a BOM-prefixed release commit, so the guard holds', () => {
      const headMessage = '\uFEFFchore(release): web-1.101.13 [skip ci]';
      expect(isReleaseCommit(headMessage)).toBe(true);
      expect(shouldSkipRelease({ headMessage, headTag: 'web-1.101.13' })).toBe(true);
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

  describe('[Unreleased] body extraction', () => {
    it('reads the body between the Unreleased header and the next release', () => {
      expect(unreleasedBody(CHANGELOG_FIXTURE)).toBe(
        [
          '',
          '### Fixed',
          "- mint a dedicated Supabase session for each MCP grant instead of copying the browser's",
          '  rotating refresh token, and retire a grant whose bridge session is gone',
          '',
        ].join('\n')
      );
    });

    it('reports the 1-based line span used for blame', () => {
      expect(unreleasedRegion(CHANGELOG_FIXTURE)).toEqual({ startLine: 4, endLine: 8 });
    });

    it('tolerates a missing Unreleased header', () => {
      expect(unreleasedBody('# Changelog\n')).toBe('');
      expect(unreleasedRegion('# Changelog\n')).toBeNull();
    });

    it('groups written entries by type, keeping multi-line bodies intact', () => {
      const groups = parseChangelogSections(unreleasedBody(CHANGELOG_FIXTURE));
      expect(groups.Added).toEqual([]);
      expect(groups.Changed).toEqual([]);
      expect(groups.Fixed).toEqual([
        "mint a dedicated Supabase session for each MCP grant instead of copying the browser's\n" +
          '  rotating refresh token, and retire a grant whose bridge session is gone',
      ]);
      expect(countChangelogEntries(groups)).toBe(1);
    });
  });

  describe('mergeChangelogGroups / composeReleaseSection', () => {
    it('folds written entries under the generated headers, once each', () => {
      const merged = mergeChangelogGroups(
        { Added: [], Fixed: ['a'], Changed: ['c'] },
        { Added: ['f'], Fixed: ['a', 'b'], Changed: [] }
      );
      expect(merged.Fixed).toEqual(['a', 'b']);
      expect(merged.Changed).toEqual(['c']);
      expect(merged.Added).toEqual(['f']);
    });

    it('cuts 1.85.3 as one section per change type, no restated change', () => {
      const commits = [
        {
          hash: 'a'.repeat(40),
          subject: 'fix(mcp): mint a dedicated Supabase session per MCP grant',
        },
        {
          hash: 'b'.repeat(40),
          subject: 'docs(scan): say why the decode worker has no origin check',
        },
      ];
      const generated = groupCommits(
        dropDocumentingCommits(commits, new Set([commits[0].hash])).map((c) => c.subject)
      );
      const written = parseChangelogSections(unreleasedBody(CHANGELOG_FIXTURE));
      const section = composeReleaseSection(
        { major: 1, minor: 85, patch: 3 },
        '2026-10-13',
        generated,
        written
      );

      expect(section.match(/^### Fixed$/gm)).toHaveLength(1);
      expect(section.match(/^### Changed$/gm)).toHaveLength(1);
      expect(section).toContain('say why the decode worker has no origin check');
      expect(section).toContain('mint a dedicated Supabase session for each MCP grant');
      expect(section).not.toContain('per MCP grant');
    });
  });

  describe('applyChangelogSection', () => {
    const section = composeReleaseSection(
      { major: 1, minor: 85, patch: 3 },
      '2026-10-13',
      { Added: [], Fixed: [], Changed: ['say why the decode worker has no origin check'] },
      parseChangelogSections(unreleasedBody(CHANGELOG_FIXTURE))
    );

    it('cuts the section in and empties the Unreleased body', () => {
      const next = applyChangelogSection(CHANGELOG_FIXTURE, section);
      expect(next).toContain('## [Unreleased]\n\n## [1.85.3] - 2026-10-13');
      expect(unreleasedBody(next).trim()).toBe('');
      expect(next).toContain('## [1.85.2] - 2026-10-12');
    });

    it('moves the written entry under the new version instead of stranding it', () => {
      const next = applyChangelogSection(CHANGELOG_FIXTURE, section);
      const cut = next.slice(next.indexOf('## [1.85.3]'), next.indexOf('## [1.85.2]'));
      expect(cut.match(/^### Fixed$/gm)).toHaveLength(1);
      expect(cut).toContain('each MCP grant');
      expect(next.match(/^### Fixed$/gm)).toHaveLength(1);
    });

    it('seeds a fresh file with the header', () => {
      expect(applyChangelogSection('', section)).toContain('## [1.85.3] - 2026-10-13');
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
