/**
 * Which page is allowed to wear the app chrome.
 *
 * Three routes are *primary* — exactly the three bottom-tab destinations. They
 * are the only ones that keep the top nav and the bottom tab bar. Every other
 * route is a *secondary* page: it gets the floating back control instead, the way
 * a native app drops its tab bar the moment you step into a detail screen.
 *
 * `frontend/ui/__tests__/route-kind.test.ts` re-derives the layout-only list
 * below from `app/` and fails when the two drift.
 */

/** The bottom-tab destinations, and nothing else. */
export const PRIMARY_ROUTES: readonly string[] = ['/', '/community', '/account'];

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
  ['blogpress', 'editor'],
  ['chats'],
  ['consultation'],
  ['linksnap', 'unlock'],
  ['mcp'],
  ['training'],
  ['u'],
];

/** Trim a trailing slash so `/account/` and `/account` are one route. */
function normalize(pathname: string | null | undefined): string {
  const clean = (pathname ?? '/').split('?')[0]?.split('#')[0] ?? '/';
  const trimmed = clean.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

function segmentsOf(pathname: string): string[] {
  return pathname.split('/').filter(Boolean);
}

export function isPrimaryRoute(pathname: string | null | undefined): boolean {
  // An unresolved pathname is treated as secondary: the back header is the safe
  // default, and its fallback (`parentRouteOf`) answers `/` for exactly this case.
  if (pathname == null) return false;

  return PRIMARY_ROUTES.includes(normalize(pathname));
}

function isLayoutOnly(pathname: string): boolean {
  const segments = segmentsOf(pathname);

  return LAYOUT_ONLY_PATHS.some(
    (pattern) =>
      pattern.length === segments.length &&
      pattern.every((part, index) => part === '*' || part === segments[index])
  );
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
