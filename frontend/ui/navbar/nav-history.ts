/**
 * Where this page load has been, and whether a back press has anywhere to go.
 *
 * The stack is our own record of the entries *we* pushed, filled from the two
 * events that can create one — an in-app link click (`NavHistoryTracker` notes
 * it before the navigation commits) and a browser traversal (`popstate`). It is
 * never inferred from a pathname change.
 *
 * That inference was the loop (#1075, again in #1569's strip): a `Link` to a
 * route already in the trail pushes a *new* browser entry, but a pathname
 * comparison cannot tell the push from a pop, so the trail popped instead — and
 * `router.back()` then walked browser entries in order, `A → B → A → B`, for as
 * long as the member kept pressing. `BottomTabBar` made it trivial: home →
 * community → home.
 *
 * Two rules keep it honest:
 *
 * 1. **Only a witnessed push grows the stack.** A navigation nobody noted (a
 *    redirect, a programmatic `router.push`, a query change) replaces the top
 *    entry in our record. Under-claiming history is safe — the control falls
 *    *up* instead of popping — while over-claiming is what dropped visitors out
 *    of the site.
 * 2. **Only a witnessed pop shrinks it.** `router.back()` is safe while the
 *    stack has depth, because every entry in it was one of ours.
 *
 * Returning to the entry behind is a back, not a push; `NavHistoryTracker` is
 * what turns that click into `router.back()`, so the stack strictly shrinks
 * when a member walks back into the page they came from.
 */
export type NavigationKind = 'push' | 'replace' | 'pop';

interface NotedNavigation {
  kind: NavigationKind;
  path: string;
  at: number;
}

/** A noted navigation older than this is a gesture that never landed. */
const NOTE_TTL_MS = 2000;

let stack: string[] = [];
let inAppPushes = 0;
let noted: NotedNavigation | null = null;
/**
 * A back press that has not landed yet. The browser answers it a frame or two
 * later, and until it does the stack still describes the page being left — so a
 * second press would pop the *next* entry. Big-brand apps are protected by the
 * screen change itself; a web app has to say so.
 */
let backUntil = 0;

/** One route, without a trailing slash, a query or a hash, so `/a/` and `/a` agree. */
function normalize(pathname: string): string {
  const clean = pathname.split('?')[0]?.split('#')[0] ?? '/';
  const trimmed = clean.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

function note(kind: NavigationKind, path: string): void {
  const next = normalize(path);

  // Next writes through the History API more than once per navigation (a push,
  // then a `replaceState` carrying its own tree). The push is the one that made
  // an entry; the follow-up must not downgrade it.
  if (
    kind === 'replace' &&
    noted?.kind === 'push' &&
    noted.path === next &&
    Date.now() - noted.at < 100
  ) {
    return;
  }

  noted = { kind, path: next, at: Date.now() };
}

/** The app is about to push this route: the commit that follows is a new entry. */
export function noteNavigation(kind: 'push' | 'replace', path: string): void {
  note(kind, path);
}

/** The browser just traversed: the commit that follows is the entry it landed on. */
export function notePop(path: string): void {
  note('pop', path);
}

/** The route the browser would land on if this page pressed back, or null. */
export function entryBehind(): string | null {
  return stack.length > 1 ? (stack[stack.length - 2] ?? null) : null;
}

/** A back press is on its way; a second one would skip the page it lands on. */
export function backInFlight(): boolean {
  return Date.now() < backUntil;
}

/** Records that a back press was made, with a ceiling for a traversal that never lands. */
export function markBackInFlight(ms = 1200): void {
  backUntil = Date.now() + ms;
}

/**
 * Records where the router now is. Called on every pathname change.
 *
 * A noted navigation is applied as itself. Anything else is treated as a
 * replace: the entry we are on is ours, the one behind it is unproven, and the
 * back control must not claim it.
 */
export function recordPathname(pathname: string): void {
  const next = normalize(pathname);
  const current = stack[stack.length - 1];

  // Only a note that names the route we landed on is applied. A redirect, or a
  // note a dead click left behind, is not evidence of anything.
  const applied =
    noted && Date.now() - noted.at < NOTE_TTL_MS && noted.path === next ? noted : null;
  noted = null;
  // Whatever was on its way has landed: the page is where it is.
  backUntil = 0;

  if (applied?.kind === 'pop') {
    if (stack.length > 1) stack.pop();
    return;
  }

  if (applied?.kind === 'push') {
    if (next === current) return;
    stack.push(next);
    inAppPushes += 1;
    return;
  }

  // A replace, or a navigation nobody witnessed: same entry, no new history.
  if (current === undefined) stack.push(next);
  else stack[stack.length - 1] = next;
}

/** True while the entry behind this page is a route this page load pushed. */
export function canGoBack(): boolean {
  return stack.length > 1;
}

/** True once the user has pushed a route inside the app during this page load. */
export function hasInAppNavigation(): boolean {
  return inAppPushes > 0;
}

/** Test seam: a fresh page load is a fresh module. */
export function resetInAppNavigation(): void {
  stack = [];
  inAppPushes = 0;
  noted = null;
  backUntil = 0;
}
