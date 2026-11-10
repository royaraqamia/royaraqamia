/**
 * The homepage app catalog, without the schemas (ADR-0146).
 *
 * Kept separate from `home-services.ts` on purpose: the browser needs the list
 * and the key type on every route, and importing the zod contract to get them
 * puts the whole validator in the initial bundle. The contract builds its enum
 * from this one array, so the two cannot drift.
 */
export const HOME_SERVICE_ROUTES = [
  '/news',
  '/rates',
  '/scan',
  '/quran',
  '/athkar',
  '/linksnap',
  '/habitflow',
  '/spendtrack',
  '/notes',
] as const;

export type HomeServiceKey = (typeof HOME_SERVICE_ROUTES)[number];

/** True for a string the strip can open; the address and the preference agree here. */
export function isHomeServiceKey(value: string | null | undefined): value is HomeServiceKey {
  return typeof value === 'string' && (HOME_SERVICE_ROUTES as readonly string[]).includes(value);
}

/**
 * The door's address for one tab (ADR-0156): `/` with the tab's key in `?tab=`.
 *
 * The key is the app's own path, so the strip, the catalog and the address all
 * spell the app the same way. A tab with no address of its own is a query on
 * the door, never a second route.
 */
export function homeTabHref(key: HomeServiceKey): string {
  return `/?tab=${key}`;
}
