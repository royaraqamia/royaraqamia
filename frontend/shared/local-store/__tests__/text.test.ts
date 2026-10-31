import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  KEPT_TEXT_CACHE,
  hasKeptSurahPage,
  keepSurahPage,
  surahPagePath,
} from '@/frontend/shared/local-store/text';

/**
 * A Cache Storage stand-in: one map per cache name, keyed by the pathname the
 * page stored. Enough to prove the key shape and the bucket name; the real
 * semantics are Chromium's and the worker suite covers what reads them.
 */
function fakeCaches() {
  const buckets = new Map<string, Map<string, Response>>();
  const open = vi.fn(async (name: string) => {
    let bucket = buckets.get(name);
    if (!bucket) {
      bucket = new Map();
      buckets.set(name, bucket);
    }
    const entries = bucket;
    return {
      match: async (key: string) => entries.get(key),
      put: async (key: string, response: Response) => {
        entries.set(key, response);
      },
    };
  });
  return { buckets, open };
}

describe('keeping a surah page (#320)', () => {
  let store: ReturnType<typeof fakeCaches>;

  beforeEach(() => {
    store = fakeCaches();
    vi.stubGlobal('caches', store);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('stores the page under the route the reader opens', async () => {
    const fetchMock = vi.fn(async () => new Response('<html>الكهف</html>', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(keepSurahPage(18)).resolves.toBe(true);

    expect(surahPagePath(18)).toBe('/quran/18');
    expect(fetchMock).toHaveBeenCalledWith('/quran/18', { credentials: 'same-origin' });

    const bucket = store.buckets.get(KEPT_TEXT_CACHE);
    expect([...(bucket?.keys() ?? [])]).toEqual(['/quran/18']);
    expect(await hasKeptSurahPage(18)).toBe(true);
    expect(await hasKeptSurahPage(19)).toBe(false);
  });

  it('keeps it in its own bucket, not the worker’s', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('ok', { status: 200 }))
    );

    await keepSurahPage(1);

    // The worker deletes every cache it does not name on activate, so the page's
    // own bucket is the only safe place for a copy that must survive a release.
    expect([...store.buckets.keys()]).toEqual([KEPT_TEXT_CACHE]);
    expect(KEPT_TEXT_CACHE).toBe('quran-text-v1');
  });

  it('does not keep an error page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 }))
    );

    await expect(keepSurahPage(2)).resolves.toBe(false);
    expect(await hasKeptSurahPage(2)).toBe(false);
  });

  it('resolves false rather than throwing when the page cannot be fetched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      })
    );

    // Keeping a page rides along with the Recitation; it must never turn a
    // working player into a failing one.
    await expect(keepSurahPage(3)).resolves.toBe(false);
  });

  it('resolves false on a device with no Cache Storage', async () => {
    vi.stubGlobal('caches', undefined);

    await expect(keepSurahPage(4)).resolves.toBe(false);
    await expect(hasKeptSurahPage(4)).resolves.toBe(false);
  });

  it('uses the cache name the worker is told to keep', () => {
    const worker = readFileSync(resolve(process.cwd(), 'public', 'sw.js'), 'utf8');

    // The worker answers a navigation from this bucket and refuses to delete it
    // on activate; both sides have to name the same string.
    expect(worker).toContain(`const KEPT_PAGES_CACHE = '${KEPT_TEXT_CACHE}'`);
    expect(worker).toMatch(/key !== KEPT_PAGES_CACHE/);
  });
});
