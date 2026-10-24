/**
 * The order a visitor keeps the `خدماتنا` sheet in, remembered on the device.
 *
 * The sheet is a personal shortlist: whoever books a consultation twice a week
 * wants that row on top, and whoever checks certificates wants the verification
 * first. So the order is theirs to arrange, and it lives in `localStorage` —
 * it survives a refresh, a new tab and a browser restart on the same device,
 * which is the whole promise. There is no account behind it, no server copy and
 * nothing leaves the browser; clearing site data restores the shipped order.
 *
 * Stored as `href`s rather than positions, because a route is what a service
 * *is* while a position only means something against the list it was measured
 * in. A service that is added, hidden or renamed then degrades to "sits where
 * the default puts it" instead of silently shuffling every other row.
 *
 * **This module must stay free of React.** The gate reads the order on first
 * paint through a lazy initialiser, and the tests drive these functions
 * directly; the hook that renders them is `use-services-order.ts`.
 */
export const SERVICES_ORDER_KEY = 'rr:services-order:v1';

/** A row's vertical extent in viewport coordinates, as the drag measures them. */
export interface RowRect {
  top: number;
  height: number;
}

function storage(store?: Storage | null): Storage | null {
  if (store !== undefined) return store;
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    // Private mode or a blocked store must fall back to the shipped order.
    return null;
  }
}

/** The stored order, or `null` when the device has none this release can read. */
export function readServicesOrder(store?: Storage | null): string[] | null {
  const target = storage(store);
  if (!target) return null;

  try {
    const raw = target.getItem(SERVICES_ORDER_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    const hrefs = parsed.filter(
      (value): value is string => typeof value === 'string' && value.length > 0
    );
    const unique = Array.from(new Set(hrefs));
    return unique.length > 0 ? unique : null;
  } catch {
    // A half-written or hand-edited value is the same as no preference.
    return null;
  }
}

export function saveServicesOrder(hrefs: readonly string[], store?: Storage | null): void {
  const target = storage(store);
  if (!target) return;

  try {
    target.setItem(SERVICES_ORDER_KEY, JSON.stringify(hrefs));
  } catch {
    // A full or blocked store only costs the visitor their arrangement.
  }
}

/**
 * A saved order reconciled against the services that exist right now: saved
 * rows first in their saved places, then anything the release added, in the
 * order the default ships it. Hrefs the release dropped simply disappear.
 */
export function resolveServicesOrder(
  defaultHrefs: readonly string[],
  saved: readonly string[] | null
): string[] {
  if (!saved || saved.length === 0) return [...defaultHrefs];

  const known = new Set(defaultHrefs);
  const kept = Array.from(new Set(saved.filter((href) => known.has(href))));
  const seen = new Set(kept);

  return [...kept, ...defaultHrefs.filter((href) => !seen.has(href))];
}

/** `list` with the item at `from` moved to `to`; out-of-range moves are refused. */
export function moveWithin<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return [...list];

  const target = Math.min(Math.max(to, 0), list.length - 1);
  if (target === from) return [...list];

  const next = [...list];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return [...list];

  next.splice(target, 0, moved);
  return next;
}

/**
 * Which slot a pointer at `y` is over, given each row's current rect in render
 * order. Above the list clamps to the first slot, below it to the last, and the
 * gaps between rows fall to the row below them.
 */
export function slotAt(y: number, rects: readonly RowRect[]): number {
  for (let index = 0; index < rects.length; index += 1) {
    const rect = rects[index];
    if (rect && y < rect.top + rect.height) return index;
  }

  return Math.max(rects.length - 1, 0);
}
