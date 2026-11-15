import { readableFields, readableText } from '@/shared/contracts/screen-context-fields';
import {
  SCREEN_CONTEXT_OVERLAYS_MAX,
  type ScreenContext,
  type ScreenContextInput,
  type ScreenContextOverlay,
} from '@/shared/contracts/screen-context';
import { screenScopes, type ScreenScope } from './screen-scopes';

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
 * knows, and the overlay registry in `screen-scopes.ts`, which is what a surface
 * registers while it is on screen — the sheet it opened, the record in hand, the
 * fields it may show (#1419). The registry is a separate module so a page that
 * registers a scope does not carry the policy into its bundle; this file is the
 * panel's half, where the policy is applied and the snapshot is composed.
 */

export {
  registerScreenScope,
  screenScopes,
  subscribeScreenScopes,
  type ScreenScope,
  type ScreenScopeKind,
} from './screen-scopes';

/** What the route provider alone knows: the path and the surface it draws. */
export interface ScreenBase {
  route: string;
  product: string;
  screenId: string;
  title: string;
  tab: string | null;
}

let published: ScreenContextInput | null = null;

/** Called by the publisher when a page settles, or by a surface opting out. */
export function publishScreen(next: ScreenContextInput | null): void {
  published = next;
}

/** What a turn sends, or `null` when this tab has no eyes yet. */
export function publishedScreen(): ScreenContextInput | null {
  return published;
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
 * The topmost overlay is what the member has in hand, so its focus, tab, fields
 * and text win; the page underneath is still visible by route, title and overlay
 * list. A screen whose policy allows nothing (or has no policy at all) reports
 * no fields and no text, whatever its registration asked for — which is what an
 * opt-out means (ADR-0181, decision 4 and 5).
 */
export function composeScreenContext(
  base: ScreenBase,
  registered: readonly ScreenScope[] = screenScopes()
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
    tab: active?.tab ?? base.tab,
    overlays,
    focus: active?.focus ?? screen?.focus ?? null,
    fields: readableFields(base.screenId, active?.fields ?? []),
    text: readableText(base.screenId, active?.text ?? ''),
    updatedAt: new Date().toISOString(),
  };
}
