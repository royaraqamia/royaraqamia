import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

// Only the addresses matter here: the rows the sitemap would enumerate are
// stubbed, so an empty DB is not what decides the outcome.
vi.mock('@/backend/loaders/community', () => ({
  loadPublishedPostSitemapEntries: async () => [],
  loadCommunityMemberHandles: async () => [],
}));
vi.mock('@/backend/loaders/quran', () => ({
  loadSurahNumbers: async () => [1, 2],
}));

import sitemap from '@/app/sitemap';

// The redirect table is the source of truth for which roots are tabs of the
// door (ADR-0168). Reading it from the config, rather than repeating the list,
// is what makes a new tab fail here instead of in a crawl report.
const require = createRequire(import.meta.url);
const { redirects } = require('../../next.config.js') as {
  redirects: () => Promise<Array<{ source: string }>>;
};

/** The path and query a crawler would fetch, which is what the sitemap lists. */
function sitemapPaths(entries: Awaited<ReturnType<typeof sitemap>>): string[] {
  return entries.map((entry) => {
    const url = new URL(entry.url);
    return `${url.pathname}${url.search}`;
  });
}

describe('sitemap', () => {
  it('lists an app root as the tab of the door that answers 200', async () => {
    const paths = sitemapPaths(await sitemap());

    expect(paths).toEqual(
      expect.arrayContaining([
        '/?tab=/news',
        '/?tab=/rates',
        '/?tab=/scan',
        '/?tab=/quran',
        '/?tab=/athkar',
      ])
    );
    for (const root of ['/rates', '/scan', '/quran', '/athkar']) {
      expect(paths).not.toContain(root);
    }
  });

  it('keeps the pages under an app root that are still their own document', async () => {
    const paths = sitemapPaths(await sitemap());

    expect(paths).toContain('/athkar/evening');
    expect(paths).toContain('/quran/1');
    expect(paths).toContain('/quran/2');
  });

  it('lists no path the redirect table answers with a redirect', async () => {
    const paths = sitemapPaths(await sitemap());
    const sources = new Set((await redirects()).map((rule) => rule.source));

    expect(paths.filter((path) => sources.has(path))).toEqual([]);
  });
});
