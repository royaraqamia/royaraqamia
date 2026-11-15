import { SCREEN_PREFIXES, SCREEN_ROUTES } from './screens.generated';

/**
 * Which screen a path is on (ADR-0181, decision 2).
 *
 * The site's shell publishes a route, a product and a screen id for every
 * route it serves, and this is the one place that turns a pathname into those
 * three. The table is generated from `perf/surfaces.json` by
 * `npm run check:screens`, so a route the matrix knows and the shell does not
 * place cannot exist: the check fails before the publish does.
 */

/** What a path resolves to, before a surface registers anything of its own. */
export interface ResolvedScreen {
  /** The surface id in `docs/mobile/screens.json`. */
  screenId: string;
  /** The product the surface belongs to. */
  product: string;
  /** The `?tab=` value the route matched on, when the route is a tab of `/`. */
  tab: string | null;
}

/**
 * Surfaces that publish nothing at all (ADR-0181, decision 8).
 *
 * The eyes exist to help a member with their own data. Reading another
 * member's row into a prompt because an operator happened to be looking at it
 * is the one failure this contract cannot recover from, so the admin area is
 * not an observed surface: no route, no fields, no text — only the sentence
 * that says the assistant cannot see this screen.
 */
export const SCREEN_CONTEXT_BLIND_SURFACES: readonly string[] = ['admin'];

export function screenIsBlind(screenId: string): boolean {
  return SCREEN_CONTEXT_BLIND_SURFACES.includes(screenId);
}

/**
 * The surface a registration belongs to: the part before its first dot
 * (ADR-0181). `community.composer` is a `community` dialog.
 */
export function surfaceOfScreenId(id: string): string {
  return id.split('.')[0] ?? '';
}

/**
 * A registration that names a blind surface.
 *
 * The route is not the only way to stand on an admin screen: a dialog is a scope
 * of its own, and an admin dialog opened over a member page must close the eyes
 * just as the route does (ADR-0181, decision 8). The registration loses — there
 * is no snapshot to fall back to, not even a route-only one.
 */
export function scopeIsBlind(id: string): boolean {
  return screenIsBlind(surfaceOfScreenId(id));
}

/** `/notes/` is `/notes`; `/` stays `/`. */
function normalize(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

function segments(path: string): string[] {
  return path.split('/').filter(Boolean);
}

/** A dynamic segment is `[name]`, and it matches exactly one segment. */
function matchesPattern(pattern: string, pathname: string): boolean {
  const want = segments(pattern);
  const got = segments(pathname);
  if (want.length !== got.length) return false;
  return want.every((part, index) => /^\[.+\]$/.test(part) || part === got[index]);
}

/**
 * The screen a pathname draws, or `null` for a path the matrix does not carry.
 *
 * A tab route is tried before the plain route it shares a path with, which is
 * what makes `/` be `home` and `/?tab=/notes` be `notes` — the generated table
 * is ordered that way, so the first match is the right one.
 */
export function resolveScreen(pathname: string, search = ''): ResolvedScreen | null {
  const path = normalize(pathname);
  const tab = new URLSearchParams(search).get('tab');

  for (const row of SCREEN_ROUTES) {
    if (row.tab !== null) {
      if (path === row.pattern && tab === row.tab) {
        return { screenId: row.surface, product: row.product, tab: row.tab };
      }
      continue;
    }
    if (matchesPattern(row.pattern, path)) {
      return { screenId: row.surface, product: row.product, tab: null };
    }
  }

  for (const row of SCREEN_PREFIXES) {
    if (path === row.prefix || path.startsWith(`${row.prefix}/`)) {
      return { screenId: row.surface, product: row.product, tab: null };
    }
  }

  return null;
}
