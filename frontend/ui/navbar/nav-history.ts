/**
 * How many client-side navigations *this page load* has seen.
 *
 * The distinction the back header needs is between "the user walked here inside
 * the app" — where `router.back()` is the right move — and "the app was opened
 * straight on this URL": a refresh, a shared link, an Android App Link, where
 * `router.back()` would drop the visitor back onto whatever they were doing
 * before, or out of the app entirely.
 *
 * A module-level counter answers it exactly, because a hard page load builds a
 * new module graph and starts again at zero.
 */
let inAppNavigations = 0;

export function markInAppNavigation(): void {
  inAppNavigations += 1;
}

export function hasInAppNavigation(): boolean {
  return inAppNavigations > 0;
}

/** Test seam: a fresh page load is a fresh module. */
export function resetInAppNavigation(): void {
  inAppNavigations = 0;
}
