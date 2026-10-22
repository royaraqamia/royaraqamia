import { describe, it, expect } from 'vitest';
import { readPrefixServe } from '../prefix-serve';

const MARKER_CACHE = 'royaraqamia-cache-meta';
const MARKER_KEY = '/__sw_prefix_serve__';

/**
 * The worker keeps the marker in the cache it already uses for its own
 * bookkeeping, so the fake is a two-entry Cache Storage: whether the name
 * exists, and what one key holds.
 */
function storage(marker: unknown, options: { present?: boolean } = {}): CacheStorage {
  const present = options.present ?? marker !== undefined;
  return {
    has: async (name: string) => present && name === MARKER_CACHE,
    open: async () => ({
      match: async (key: string) =>
        key === MARKER_KEY && marker !== undefined ? { json: async () => marker } : undefined,
    }),
  } as unknown as CacheStorage;
}

function marker(overrides: Record<string, unknown> = {}) {
  return { version: 1, requested: '/quran/7', served: '/quran', ...overrides };
}

describe('readPrefixServe', () => {
  it('reports the ancestor the worker answered with', async () => {
    await expect(readPrefixServe('/quran/7', storage(marker()))).resolves.toBe('/quran');
  });

  it('accepts the homepage as the ancestor of any path', async () => {
    // `/u` is a segment without a page, so the homepage answered the miss.
    const root = marker({ requested: '/u/someone', served: '/' });
    await expect(readPrefixServe('/u/someone', storage(root))).resolves.toBe('/');
  });

  it('ignores a marker left by a navigation to another path', async () => {
    // The worker clears it per navigation, but a marker read across a tab that
    // navigated in between must not put a card on the wrong page.
    await expect(readPrefixServe('/community/foo', storage(marker()))).resolves.toBeNull();
  });

  it('refuses a marker whose served path is not an ancestor', async () => {
    const mismatched = marker({ requested: '/community/foo', served: '/quran' });
    await expect(readPrefixServe('/community/foo', storage(mismatched))).resolves.toBeNull();

    const samePath = marker({ requested: '/quran/7', served: '/quran/7' });
    await expect(readPrefixServe('/quran/7', storage(samePath))).resolves.toBeNull();
  });

  it('refuses an entry from another schema version or a malformed one', async () => {
    await expect(readPrefixServe('/quran/7', storage(marker({ version: 2 })))).resolves.toBeNull();
    await expect(
      readPrefixServe('/quran/7', storage({ requested: '/quran/7' }))
    ).resolves.toBeNull();
    await expect(readPrefixServe('/quran/7', storage('nope'))).resolves.toBeNull();
  });

  it('resolves to null without Cache Storage or a marker cache', async () => {
    await expect(readPrefixServe('/quran/7', undefined)).resolves.toBeNull();
    await expect(
      readPrefixServe('/quran/7', storage(marker(), { present: false }))
    ).resolves.toBeNull();
  });

  it('never throws when the cache read fails', async () => {
    const broken = {
      has: async () => true,
      open: async () => {
        throw new Error('denied');
      },
    } as unknown as CacheStorage;
    await expect(readPrefixServe('/quran/7', broken)).resolves.toBeNull();
  });
});
