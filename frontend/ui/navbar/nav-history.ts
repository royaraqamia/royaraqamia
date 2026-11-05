/**
 * Where this page load has been, and whether a back press has anywhere to go.
 *
 * `router.back()` is only safe while the entry behind this one is a page the
 * user walked to inside the app. A cold entry — a refresh, a shared link, an
 * Android App Link — has whatever preceded it outside the app, and popping
 * there drops the visitor onto someone else's page or out of the site.
 *
 * A count was not enough. It said "some navigation happened", which stays true
 * for the rest of the page load, so a page could think it had a history it no
 * longer had (`/chats/[id]` → `/notifications` → hardware back → `/chats/[id]`
 * and the control still believed it could pop). Keeping the *trail* of visited
 * routes answers the real question — is the entry behind this one one of ours?
 * — and lets a traversal back pop our own record too, so pressing back cannot
 * make the trail grow.
 */
let trail: string[] = [];
let inAppNavigations = 0;

/** One route, without a trailing slash or a query, so `/a/` and `/a` agree. */
function normalize(pathname: string): string {
  const clean = pathname.split('?')[0]?.split('#')[0] ?? '/';
  const trimmed = clean.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/**
 * Records where the router now is. Called on every pathname change.
 *
 * A route equal to the one behind the current entry is a traversal back to it,
 * not a new visit: our record of the page being left is dropped, the way the
 * browser dropped its entry.
 */
export function recordPathname(pathname: string): void {
  const next = normalize(pathname);
  const last = trail[trail.length - 1];

  if (next === last) return;

  if (trail.length > 1 && next === trail[trail.length - 2]) {
    trail.pop();
    return;
  }

  trail.push(next);
  if (trail.length > 1) inAppNavigations += 1;
}

/** True while the entry behind this page is a route from this page load. */
export function canGoBack(): boolean {
  return trail.length > 1;
}

/** True once the user has navigated inside the app during this page load. */
export function hasInAppNavigation(): boolean {
  return inAppNavigations > 0;
}

/** Test seam: a fresh page load is a fresh module. */
export function resetInAppNavigation(): void {
  trail = [];
  inAppNavigations = 0;
}
