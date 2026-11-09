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
  '/verify',
  '/rates',
  '/scan',
  '/quran',
  '/athkar',
  '/linksnap',
  '/habitflow',
  '/spendtrack',
  '/notes',
  '/mcp/guide',
] as const;

export type HomeServiceKey = (typeof HOME_SERVICE_ROUTES)[number];
