import { HOME_SERVICE_ROUTES } from '@/shared/contracts/home-services-catalog';

/**
 * Which chrome a page wears.
 *
 * The homepage is the app door (ADR-0146), so its tabs are the member's apps:
 * the eleven roots open inside the same shell, exactly like the three bottom-tab
 * destinations. A drill-down is still a page of its own and drops to the
 * floating back control, and a public entry a stranger can land on (a printed
 * certificate, an unlock link) gets the top nav without the member's tab bar
 * (ADR-0149).
 *
 * `frontend/ui/__tests__/route-kind.test.ts` re-derives the layout-only list
 * below from `app/` and fails when the two drift.
 */

/** The three bottom-tab destinations. */
export const PRIMARY_ROUTES: readonly string[] = ['/', '/community', '/account'];

/** The member's app roots, from the one catalog the strip and picker read. */
export const APP_ROUTES: readonly string[] = HOME_SERVICE_ROUTES;

/**
 * Pages that left the picker but still wear the app chrome (ADR-0152): the
 * certificate check and the MCP guide answer their own routes and are reached
 * from a certificate or the account, so the top nav and the tab bar stay.
 */
export const STANDALONE_ROUTES: readonly string[] = ['/verify', '/mcp/guide'];

/**
 * Views inside a root that are a mode of it, not a drill-down: a sitting of the
 * same reader, reached from a tab that never leaves the app.
 */
export const APP_MODE_ROUTES: readonly string[] = ['/athkar/evening'];

/**
 * Public entry points a stranger lands on: the top nav gives them a way into
 * the site, and the member's tab bar would be noise. The pattern's `*` matches
 * exactly one segment.
 */
export const TOP_NAV_ONLY_PATHS: readonly (readonly string[])[] = [
  ['verify', '*'],
  ['linksnap', 'unlock', '*'],
];

/**
 * Paths that exist only to hold children: a directory with no `page.tsx` of its
 * own, on the way to one that has. "Go up" has to step over them, because
 * landing on one is a 404 — `/auth` is a layout, `/consultation` is the folder
 * above `/consultation/book`.
 *
 * A `*` matches exactly one segment, which is how a dynamic folder
 * (`/admin/certificates/[id]`) is spelled here.
 */
export const LAYOUT_ONLY_PATHS: readonly (readonly string[])[] = [
  ['admin', 'certificates', '*'],
  ['admin', 'clients'],
  ['admin', 'consultations'],
  ['admin', 'training'],
  ['auth'],
  ['chats'],
  ['consultation'],
  ['linksnap', 'unlock'],
  ['mcp'],
  ['training'],
  ['u'],
];

/** The three chromes a page can wear. */
export type ChromeKind = 'app' | 'top' | 'back';

/** Trim a trailing slash so `/account/` and `/account` are one route. */
function normalize(pathname: string | null | undefined): string {
  const clean = (pathname ?? '/').split('?')[0]?.split('#')[0] ?? '/';
  const trimmed = clean.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

function segmentsOf(pathname: string): string[] {
  return pathname.split('/').filter(Boolean);
}

/**
 * True for the homepage and the eleven app roots — the destinations the bottom
 * bar's Home tab stands for.
 */
export function isAppRoot(pathname: string | null | undefined): boolean {
  if (pathname == null) return false;
  const path = normalize(pathname);

  return path === '/' || APP_ROUTES.includes(path) || APP_MODE_ROUTES.includes(path);
}

/** True while the page wears the app chrome: top nav and bottom tab bar. */
export function isPrimaryRoute(pathname: string | null | undefined): boolean {
  // An unresolved pathname is treated as secondary: the back header is the safe
  // default, and its fallback (`parentRouteOf`) answers `/` for exactly this case.
  if (pathname == null) return false;

  const path = normalize(pathname);

  return (
    PRIMARY_ROUTES.includes(path) ||
    APP_ROUTES.includes(path) ||
    APP_MODE_ROUTES.includes(path) ||
    STANDALONE_ROUTES.includes(path)
  );
}

function matchesPattern(pattern: readonly string[], pathname: string): boolean {
  const segments = segmentsOf(pathname);

  return (
    pattern.length === segments.length &&
    pattern.every((part, index) => part === '*' || part === segments[index])
  );
}

function isLayoutOnly(pathname: string): boolean {
  return LAYOUT_ONLY_PATHS.some((pattern) => matchesPattern(pattern, pathname));
}

/**
 * The chrome a path wears. `top` is the public entry: the top nav without the
 * member's tab bar and without a floating back control.
 */
export function chromeFor(pathname: string | null | undefined): ChromeKind {
  if (pathname == null) return 'back';

  const path = normalize(pathname);

  if (isPrimaryRoute(path)) return 'app';
  if (TOP_NAV_ONLY_PATHS.some((pattern) => matchesPattern(pattern, path))) return 'top';

  return 'back';
}

/**
 * Where "back" lands when this page load has no in-app history to pop — a
 * refresh, a shared link, an Android App Link. Walks up the URL to the nearest
 * ancestor that is a real page, and answers `/` when there is none.
 */
export function parentRouteOf(pathname: string | null | undefined): string {
  let candidate = normalize(pathname);

  while (candidate !== '/') {
    const segments = segmentsOf(candidate);
    segments.pop();
    if (segments.length === 0) return '/';

    candidate = `/${segments.join('/')}`;
    if (!isLayoutOnly(candidate)) return candidate;
  }

  return '/';
}
