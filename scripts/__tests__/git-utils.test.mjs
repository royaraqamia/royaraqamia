import { describe, it, expect } from 'vitest';
import { parseTag, sortSemverTags, latestSemverTag } from '../git-utils.mjs';

describe('git-utils', () => {
  describe('parseTag', () => {
    it('accepts bare and v-prefixed semver tags', () => {
      expect(parseTag('1.4.1')).toEqual({ major: 1, minor: 4, patch: 1 });
      expect(parseTag('v2.0.0')).toEqual({ major: 2, minor: 0, patch: 0 });
    });

    it('rejects non-semver tags', () => {
      expect(parseTag('backup-1')).toBeNull();
      expect(parseTag('v1.4')).toBeNull();
      expect(parseTag(null)).toBeNull();
    });
  });

  describe('sortSemverTags', () => {
    it('filters non-semver tags and sorts descending by version', () => {
      const entries = sortSemverTags('backup-1\nv1.0.0\nv1.4.1\nv1.4.0\nv2.0.0');
      expect(entries.map((e) => e.tag)).toEqual(['v2.0.0', 'v1.4.1', 'v1.4.0', 'v1.0.0']);
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
});
