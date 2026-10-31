/**
 * The surah pages the reader keeps for offline reading (#320, ADR-0071).
 *
 * Playing a surah already keeps its Recitation (ADR-0083), and a surah you can
 * hear on a plane is one you should be able to open on that plane. The page is
 * kept in its own Cache Storage bucket, keyed by the route the reader opens:
 *
 * - **its own bucket, not the worker's.** The install precaches none of this —
 *   the 114 documents are 17 MiB of HTML and the route cap would have to rise
 *   from 32 to ~146 (ADR-0071) — so this is a per-surah copy the reader asked
 *   for by playing, not a precache. `public/sw.js` names the bucket in its
 *   activate keep-list, which is what stops a release taking it with it.
 * - **keyed by pathname**, so the worker can answer `/quran/18` from it without
 *   knowing anything about surah numbers, and so the key the page writes is the
 *   key the navigation asks for.
 *
 * The copy is refreshed by the worker rather than here: a navigation that
 * reaches the network writes its own answer back into this bucket, so a kept
 * page follows a release without the page ever fetching itself twice.
 */

/**
 * The Cache Storage bucket kept pages live in. `public/sw.js` must name the same
 * string in its activate keep-list, and
 * `frontend/shared/local-store/__tests__/text.test.ts` asserts the two agree.
 */
export const KEPT_TEXT_CACHE = 'quran-text-v1';

/** Where a surah's page lives, and the key its copy is stored under. */
export function surahPagePath(surah: number): string {
  return `/quran/${surah}`;
}

/**
 * Stores one surah's page for offline reading.
 *
 * Resolves `false` — never throws — when the device cannot hold a copy or the
 * page did not arrive: keeping a page is a convenience that rides along with the
 * Recitation, and it must not turn a working player into a failing one.
 */
export async function keepSurahPage(surah: number): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  const path = surahPagePath(surah);

  try {
    const cache = await caches.open(KEPT_TEXT_CACHE);
    const response = await fetch(path, { credentials: 'same-origin' });
    // A page that came back as an error is not a page to read offline.
    if (!response.ok) return false;
    await cache.put(path, response);
    return true;
  } catch {
    return false;
  }
}

/** Whether this device holds a copy of the surah's page. */
export async function hasKeptSurahPage(surah: number): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const cache = await caches.open(KEPT_TEXT_CACHE);
    return (await cache.match(surahPagePath(surah))) !== undefined;
  } catch {
    return false;
  }
}
