import type { ScreenScope } from '@/frontend/state/screen-scopes';

/**
 * What the account pages register while they draw (ADR-0181, #1421).
 *
 * The route provider already names each of these from the matrix, so this list
 * is not how the turn learns the path: it is where the surface says it was
 * decided rather than forgotten, and it is the row the profile card's own state
 * would attach to. Nothing here publishes a field or an excerpt — the profile,
 * the handle, the email and the plan are the member's own, and the default for a
 * surface with no allowlist row is deny (ADR-0181 decision 4).
 *
 * The table is keyed by the path because `/account` is one layout around nine
 * pages: one registration in the layout, switched by the pathname, rather than
 * nine client leaves that each add a line for the route provider to repeat.
 */
const ACCOUNT_SCREENS: Readonly<Record<string, ScreenScope>> = {
  '/account': { id: 'account.page', kind: 'screen' },
  '/account/links': { id: 'account-links.page', kind: 'screen' },
  '/account/posts': { id: 'account-posts.page', kind: 'screen' },
  '/account/submissions': { id: 'account-submissions.page', kind: 'screen' },
  '/account/plan': { id: 'account-plan.page', kind: 'screen' },
  '/account/connected-apps': { id: 'account-connected-apps.page', kind: 'screen' },
  '/account/blocked': { id: 'account-blocked.page', kind: 'screen' },
  '/account/memory': { id: 'account-memory.page', kind: 'screen' },
  '/account/faq': { id: 'account-faq.page', kind: 'screen' },
  '/account/news': { id: 'account-news.page', kind: 'screen' },
};

/** The scope the account subtree registers, or `null` for a path outside it. */
export function accountScreenScope(pathname: string): ScreenScope | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  // Own-property only: the pathname is client input, and `constructor` would
  // otherwise index `Object.prototype` and hand back a function as a scope.
  return Object.hasOwn(ACCOUNT_SCREENS, path) ? (ACCOUNT_SCREENS[path] ?? null) : null;
}
