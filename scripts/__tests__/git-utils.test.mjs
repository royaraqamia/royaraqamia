import { describe, it, expect } from 'vitest';
import {
  parseTag,
  formatTag,
  formatVersion,
  sortSemverTags,
  latestSemverTag,
  highestSemverTag,
} from '../git-utils.mjs';

describe('git-utils', () => {
  describe('parseTag', () => {
    it('accepts the current spelling and the two that came before it', () => {
      expect(parseTag('web-1.97.0')).toEqual({ major: 1, minor: 97, patch: 0 });
      expect(parseTag('v2.0.0')).toEqual({ major: 2, minor: 0, patch: 0 });
      expect(parseTag('1.4.1')).toEqual({ major: 1, minor: 4, patch: 1 });
    });

    it('rejects non-semver tags, including the shell line', () => {
      expect(parseTag('backup-1')).toBeNull();
      expect(parseTag('v1.4')).toBeNull();
      expect(parseTag(null)).toBeNull();
      // The two release lines have separate clocks: a shell tag in the web
      // version list would make the web train bump for an APK (ADR-0046).
      expect(parseTag('android-1.0.3')).toBeNull();
      expect(parseTag('shell')).toBeNull();
    });
  });

  describe('formatTag / formatVersion', () => {
    it('one puts the prefix on, the other leaves it off', () => {
      const version = { major: 1, minor: 97, patch: 0 };
      expect(formatVersion(version)).toBe('1.97.0');
      expect(formatTag(version)).toBe('web-1.97.0');
      expect(parseTag(formatTag(version))).toEqual(version);
      expect(parseTag(formatVersion(version))).toEqual(version);
    });
  });

  describe('sortSemverTags', () => {
    it('filters non-semver tags and sorts descending by version', () => {
      const entries = sortSemverTags('backup-1\nv1.0.0\nweb-1.4.1\nv1.4.0\nandroid-1.0.3\nv2.0.0');
      expect(entries.map((e) => e.tag)).toEqual(['v2.0.0', 'web-1.4.1', 'v1.4.0', 'v1.0.0']);
    });

    it('handles empty input', () => {
      expect(sortSemverTags('')).toEqual([]);
      expect(sortSemverTags(null)).toEqual([]);
    });
  });

  describe('latestSemverTag', () => {
    it('returns a semver tag or null when none/git absent', () => {
      const tag = latestSemverTag();
      if (tag === null) return;
      expect(parseTag(tag)).not.toBeNull();
    });
  });

  describe('highestSemverTag', () => {
    it('returns a semver tag or null when none/git absent', () => {
      const tag = highestSemverTag();
      if (tag === null) return;
      expect(parseTag(tag)).not.toBeNull();
    });

    it('is never lower than the highest tag reachable from HEAD', () => {
      // The reachable tags are a subset of the tags that exist, so the version
      // base can only move forward: a tag whose commit never reached `main`
      // still owns its number (ADR-0051).
      const claimed = highestSemverTag();
      if (claimed === null) return;
      const reachable = latestSemverTag();
      const highest = sortSemverTags([claimed, reachable].filter(Boolean).join('\n'))[0];
      expect(highest.tag).toBe(claimed);
    });
  });
});
