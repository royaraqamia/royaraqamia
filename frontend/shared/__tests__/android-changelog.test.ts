import { describe, expect, it, vi } from 'vitest';

import {
  CHANGELOG_PAGE_LIMIT,
  ANDROID_CHANGELOG_PATH,
  fetchAndroidChangelog,
  toAndroidReleases,
} from '../android-changelog';

describe('reading the Android changelog', () => {
  it('keeps the releases that say something', () => {
    const releases = toAndroidReleases({
      releases: [
        {
          version: '1.1.0',
          versionCode: 20100,
          releasedAt: '2026-11-02',
          notes: ['ميزة: الكاميرا', '', '  '],
        },
        { version: '', notes: ['بلا إصدار'] },
        { version: '1.0.20', notes: [] },
        { version: '1.0.19', notes: 'not-a-list' },
      ],
    });

    expect(releases).toEqual([
      {
        version: '1.1.0',
        versionCode: 20100,
        releasedAt: '2026-11-02',
        notes: ['ميزة: الكاميرا'],
      },
    ]);
  });

  it('returns nothing for a value that is not a changelog', () => {
    expect(toAndroidReleases(null)).toEqual([]);
    expect(toAndroidReleases({})).toEqual([]);
    expect(toAndroidReleases({ releases: 'nope' })).toEqual([]);
    expect(toAndroidReleases({ releases: [] })).toEqual([]);
  });

  it('fills in a missing code and date rather than rejecting the release', () => {
    const [release] = toAndroidReleases({
      releases: [{ version: '1.1.0', notes: ['ميزة'] }],
    });

    expect(release).toEqual({ version: '1.1.0', versionCode: 0, releasedAt: '', notes: ['ميزة'] });
  });

  it('is bounded, so a long file cannot make an endless page', () => {
    const releases = toAndroidReleases({
      releases: Array.from({ length: CHANGELOG_PAGE_LIMIT + 5 }, (_, index) => ({
        version: `1.0.${index}`,
        versionCode: 20000 + index,
        notes: ['x'],
      })),
    });

    expect(releases).toHaveLength(CHANGELOG_PAGE_LIMIT);
  });

  it('fetches from the site path, never from a cache', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ releases: [{ version: '1.1.0', notes: ['ميزة'] }] }),
    })) as unknown as typeof fetch;

    const releases = await fetchAndroidChangelog({ fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(ANDROID_CHANGELOG_PATH, { cache: 'no-store' });
    expect(releases).toHaveLength(1);
  });

  it('answers with an empty list when the file cannot be read', async () => {
    const failing = vi.fn(async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
    expect(await fetchAndroidChangelog({ fetchImpl: failing })).toEqual([]);

    const throwing = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await fetchAndroidChangelog({ fetchImpl: throwing })).toEqual([]);
  });
});
