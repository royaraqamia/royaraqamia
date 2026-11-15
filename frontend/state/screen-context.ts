import {
  readableFields,
  readableText,
  type ScreenFieldCandidate,
} from '@/shared/contracts/screen-context-fields';
import {
  SCREEN_CONTEXT_OVERLAYS_MAX,
  type ScreenContext,
  type ScreenContextFocus,
  type ScreenContextInput,
  type ScreenContextOverlay,
} from '@/shared/contracts/screen-context';

/**
 * The screen this tab is on, as the tab knows it (ADR-0181).
 *
 * It lives in the session's memory and nowhere else: not in `localStorage`, not
 * in a cookie, not in a table, and not in a log. A page the member left is not
 * context, it is a record of where they have been, so a reload starts blind and
 * the publisher fills the store again as the page settles.
 *
 * It is a module rather than a React context on purpose. The publisher lives in
 * the assistant panel's lazily imported chunk, and the consumer is the same
 * panel; the composer reads this value at the moment it sends a turn, which is
 * exactly when it has to be current — a render-based value would be one
 * keystroke behind by design.
 *
 * Two publishers feed it: the route provider, which owns everything a path
 * knows, and the overlay registry here, which is what a surface registers while
 * it is on screen — the sheet it opened, the record in hand, the fields it may
 * show (#1419). The registry is a stack rather than a store because a sheet
 * opened over a list is the top of it, and closing the sheet must restore the
 * list without the sheet's author doing anything.
 */

/** What the route provider alone knows: the path and the surface it draws. */
export interface ScreenBase {
  route: string;
  product: string;
  screenId: string;
  title: string;
  tab: string | null;
}

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
  /** The overlay's own id, stable across a redraw. */
  id: string;
  kind: ScreenScopeKind;
  /** The record in hand, when the surface has one. */
  focus?: ScreenContextFocus | null;
  /** The form's own fields, before redaction. */
  fields?: readonly ScreenFieldCandidate[];
  /** What the surface chooses to quote, before the policy decides. */
  text?: string;
}

let published: ScreenContextInput | null = null;
let scopes: ScreenScope[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Called by the publisher when a page settles, or by a surface opting out. */
export function publishScreen(next: ScreenContextInput | null): void {
  published = next;
}

/** What a turn sends, or `null` when this tab has no eyes yet. */
export function publishedScreen(): ScreenContextInput | null {
  return published;
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

/** The screen's own registration: the last one, because a page registers once. */
function screenScopeOf(all: readonly ScreenScope[]): ScreenScope | null {
  for (let index = all.length - 1; index >= 0; index -= 1) {
    const candidate = all[index];
    if (candidate?.kind === 'screen') return candidate;
  }
  return null;
}

/**
 * The snapshot the turn receives, composed from the route and the stack.
 *
 * The topmost overlay is what the member has in hand, so its focus, fields and
 * text win; the page underneath is still visible by route, title and overlay
 * list. A screen whose policy allows nothing (or has no policy at all) reports
 * no fields and no text, whatever its registration asked for — which is what an
 * opt-out means (ADR-0181, decision 4 and 5).
 */
export function composeScreenContext(
  base: ScreenBase,
  registered: readonly ScreenScope[] = scopes
): ScreenContext {
  const overlays: ScreenContextOverlay[] = registered
    .filter((scope) => scope.kind !== 'screen')
    .map(({ id, kind }) => ({ id, kind }))
    .slice(-SCREEN_CONTEXT_OVERLAYS_MAX);

  const screen = screenScopeOf(registered);
  const open = registered.filter((scope) => scope.kind !== 'screen');
  const active = open.length > 0 ? (open.at(-1) ?? null) : screen;

  return {
    ...base,
    overlays,
    focus: active?.focus ?? screen?.focus ?? null,
    fields: readableFields(base.screenId, active?.fields ?? []),
    text: readableText(base.screenId, active?.text ?? ''),
    updatedAt: new Date().toISOString(),
  };
}
