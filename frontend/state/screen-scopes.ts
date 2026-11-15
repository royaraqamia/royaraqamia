import type { ScreenContextFocus } from '@/shared/contracts/screen-context';
import type { ScreenFieldCandidate } from '@/shared/contracts/screen-context-fields';

/**
 * What a surface registers while it is on screen (ADR-0181, decision 2).
 *
 * The registry lives in its own module, apart from the composer, for the reason
 * the publisher is not in the site shell: a page that registers a scope must not
 * pay for the allowlist and the denylist, which only the panel's chunk applies.
 * Everything here is the surface's own model — the fields it hands over are
 * candidates, and nothing in this module decides whether they may be read.
 *
 * The registry is a stack rather than a store because a sheet opened over a list
 * is the top of it, and closing the sheet must restore the list without the
 * sheet's author doing anything.
 */

/** A sheet, a dialog and a popover sit above the screen; a screen scope is the base. */
export type ScreenScopeKind = 'screen' | 'sheet' | 'dialog' | 'popover';

/**
 * What a surface registers while it is on screen.
 *
 * The fields are candidates, not readable fields: `readableFields` applies the
 * surface's allowlist and the structural denylist, so a component that hands
 * over its whole form by mistake still cannot publish a password
 * (ADR-0181, decision 4).
 */
export interface ScreenScope {
  /**
   * The scope's id, `<surface>.<name>` — `news.page`, `spendtrack.expense`.
   *
   * The part before the first dot is the surface's id in
   * `docs/mobile/screens.json`, which is what lets `npm run check:screens` see a
   * registration that names a screen the registry does not have. The name says
   * which box it is: the page itself, or the sheet, dialog or popover above it.
   * The id is stable across a redraw, so the record goes in `focus`, never in
   * the id.
   */
  id: string;
  kind: ScreenScopeKind;
  /** The record in hand, when the surface has one. */
  focus?: ScreenContextFocus | null;
  /**
   * The tab or chip the surface has selected, when the route does not name it.
   *
   * A surface that keeps its selection in its own state — the digest's public
   * or personal view, the athkar sitting, the rates basis — publishes it here;
   * the route provider's `tab` is the answer for the tab routes and the default
   * for everything else.
   */
  tab?: string | null;
  /** The form's own fields, before redaction. */
  fields?: readonly ScreenFieldCandidate[];
  /** What the surface chooses to quote, before the policy decides. */
  text?: string;
}

let scopes: ScreenScope[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Publish a scope until the returned function is called.
 *
 * A surface calls this while it is open — a dialog on mount, a page while it
 * draws — and the cleanup is the close. Registering the same id twice replaces
 * the earlier entry rather than stacking it, so a form that re-registers on
 * every keystroke does not fill the stack with its own history.
 */
export function registerScreenScope(scope: ScreenScope): () => void {
  scopes = [...scopes.filter((entry) => entry.id !== scope.id), scope];
  notify();

  return () => {
    const next = scopes.filter((entry) => entry !== scope);
    if (next.length === scopes.length) return;
    scopes = next;
    notify();
  };
}

/** The open scopes, in registration order. */
export function screenScopes(): readonly ScreenScope[] {
  return scopes;
}

/** The publisher re-settles whenever a surface opens, closes or edits a field. */
export function subscribeScreenScopes(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
