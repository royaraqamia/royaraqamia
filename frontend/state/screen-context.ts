import type { ScreenContextInput } from '@/shared/contracts/screen-context';

/**
 * The screen this tab is on, as the tab knows it (ADR-0181).
 *
 * It lives in the session's memory and nowhere else: not in `localStorage`, not
 * in a cookie, not in a table, and not in a log. A page the member left is not
 * context, it is a record of where they have been, so a reload starts blind and
 * the publisher fills the store again as the page settles.
 *
 * It is a module rather than a React context on purpose. The publisher is chrome
 * mounted by the site's shell, and the consumer is the assistant panel, which is
 * imported lazily from the corner of a different tree; the composer reads this
 * value at the moment it sends a turn, which is exactly when it has to be
 * current — a render-based value would be one keystroke behind by design.
 */

let published: ScreenContextInput | null = null;

/** Called by the publisher when a page settles, or by a surface opting out. */
export function publishScreen(next: ScreenContextInput | null): void {
  published = next;
}

/** What a turn sends, or `null` when this tab has no eyes yet. */
export function publishedScreen(): ScreenContextInput | null {
  return published;
}
