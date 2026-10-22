/**
 * What the service worker answered this document with (#490).
 *
 * A navigation the worker has no copy of is answered with the nearest cached
 * ancestor shell — `/community` for a never-visited `/community/<slug>` — and the
 * URL stays the requested one. That swap is invisible in the response: the page
 * that hydrates *is* the parent's document, so it cannot tell what it asked for
 * from what it got. The worker records the pair beside its own cache bookkeeping
 * and clears it on the next navigation, so the marker read here always describes
 * the document in front of the user.
 *
 * The card the app draws for it is the existing needs-connection state: an
 * offline deep link keeps the app's chrome and says this link is not available
 * offline, instead of replacing the screen with `/offline`.
 */

// Mirrors `PREFIX_MARKER_KEY` and `CACHE_META_NAME` in `public/sw.js`. They are
// plain literals there because the worker is a classic script, so the names are
// repeated rather than imported; a change on either side breaks the card, which
// the offline e2e asserts.
const MARKER_CACHE = 'royaraqamia-cache-meta';
const MARKER_KEY = '/__sw_prefix_serve__';
const MARKER_VERSION = 1;

interface PrefixServeMarker {
  version: number;
  /** The pathname the user asked for. */
  requested: string;
  /** The ancestor document the worker answered with. */
  served: string;
}

function isMarker(value: unknown): value is PrefixServeMarker {
  if (!value || typeof value !== 'object') return false;
  const marker = value as Partial<PrefixServeMarker>;
  return (
    marker.version === MARKER_VERSION &&
    typeof marker.requested === 'string' &&
    typeof marker.served === 'string'
  );
}

/**
 * True when `served` really is an ancestor of `requested` — the marker is only
 * evidence if it describes a prefix serve, and `/` matches every path.
 */
function isAncestor(served: string, requested: string): boolean {
  if (served === requested) return false;
  if (served === '/') return requested.startsWith('/');
  return requested.startsWith(`${served}/`);
}

function browserCacheStorage(): CacheStorage | undefined {
  return typeof caches === 'undefined' ? undefined : caches;
}

/**
 * Resolves the cached ancestor this document was served from, or null when the
 * worker answered the requested URL itself (or there is no worker).
 *
 * Best-effort: a browser without Cache Storage, or a marker another tab already
 * replaced, resolves to null — the document the user is looking at is still the
 * real answer, and the card is an addition to it.
 */
export async function readPrefixServe(
  pathname: string,
  storage: CacheStorage | undefined = browserCacheStorage()
): Promise<string | null> {
  if (!storage) return null;
  try {
    if (!(await storage.has(MARKER_CACHE))) return null;
    const cache = await storage.open(MARKER_CACHE);
    const entry = await cache.match(MARKER_KEY);
    if (!entry) return null;
    const marker: unknown = await entry.json();
    if (!isMarker(marker)) return null;
    if (marker.requested !== pathname) return null;
    return isAncestor(marker.served, marker.requested) ? marker.served : null;
  } catch {
    return null;
  }
}
