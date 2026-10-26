/**
 * The key a public snapshot is stored under (#555).
 *
 * A public surface's addressed state is its path **and** the query the reader
 * chose —?" `/news?date=2026-10-25&category=tech` is a different digest from
 * `/news` —?" so both belong in the key. A router's own bookkeeping does not:
 * `_rsc` is a hash of the request's headers (the worker normalises it for Cache
 * Storage for the same reason, #492), and `next-url` names where the navigation
 * came from rather than what it asked for.
 *
 * The entry therefore belongs to the *page*, not to the router state that asked
 * for it: two ways of reaching the same digest read the same snapshot, and a
 * snapshot written online is still found by the offline reload that follows.
 */

/**
 * Parameters a router adds for its own purposes. Dropping them is what makes a
 * snapshot reusable; keeping any other parameter is what makes it correct.
 */
const VOLATILE_PARAMS = new Set(['_rsc', 'next-url', 'next-router-prefetch']);

/** `/news/` and `/news` are one route; the root stays `/`. */
function normalisePath(pathname: string): string {
  if (!pathname) return '/';
  const withLeading = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const trimmed = withLeading.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/**
 * `<path>` or `<path>?<sorted query>`, with the router's own parameters gone.
 *
 * Sorting makes two orderings of the same filters one key, and repeats are kept
 * as repeats because `?tag=a&tag=b` is not `?tag=b&tag=a` at the far end.
 */
export function normaliseSnapshotRoute(pathname: string, search = ''): string {
  const path = normalisePath(pathname);

  const raw = search.startsWith('?') ? search.slice(1) : search;
  if (raw === '') return path;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(raw);
  } catch {
    // A query this shape cannot parse names nothing stable, so the route is the
    // key: better no query in the key than a different key on every read.
    return path;
  }

  const pairs = [...params.entries()].filter(([name]) => !VOLATILE_PARAMS.has(name));
  if (pairs.length === 0) return path;

  pairs.sort(([aName, aValue], [bName, bValue]) =>
    aName === bName ? aValue.localeCompare(bValue) : aName.localeCompare(bName)
  );

  const query = new URLSearchParams();
  for (const [name, value] of pairs) query.append(name, value);

  const serialised = query.toString();
  return serialised === '' ? path : `${path}?${serialised}`;
}

/**
 * Whether a route is one of the unbounded detail routes —?" `/community/<slug>`,
 * `/verify/<code>`, `/u/<handle>` —?" rather than a list surface.
 *
 * A list surface has one addressed state per filter choice, so its snapshots are
 * bounded by the reader's own browsing. A detail route is keyed by a value the
 * *address* chooses, so a crawl can mint one entry per path; those are the
 * entries the store keeps in an LRU ({@link PUBLIC_DETAIL_LIMIT}).
 *
 * The test is structural rather than a list of known routes: the first segment
 * names a surface, and a second segment is a concrete item under it.
 */
export function isDetailRoute(route: string): boolean {
  const path = normalisePath(route.split('?')[0] ?? route);
  return path.split('/').filter(Boolean).length >= 2;
}
