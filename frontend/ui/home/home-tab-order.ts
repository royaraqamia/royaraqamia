/**
 * The homepage strip's order arithmetic (ADR-0202).
 *
 * Kept free of React so the drag, the keyboard and the tests all use one
 * definition of "the pill moved one slot": the drag asks which slot a pointer is
 * over, the keyboard asks which slot an arrow key names, and both hand the
 * result to the same `moveWithin`.
 */
export interface TabRect {
  /** The pill's viewport left, from layout rather than from its transform. */
  left: number;
  width: number;
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
 * Which slot a pointer at `x` is over: the pill whose midpoint is nearest. The
 * midpoint rule is what makes a pointer resting on a pill's own centre answer
 * that pill, and what hands the slot over exactly halfway to its neighbour. The
 * strip's direction never enters the arithmetic, because the rects are already
 * in render order.
 */
export function slotAtX(x: number, rects: readonly TabRect[]): number {
  let best = 0;
  let bestDistance = Infinity;

  for (let index = 0; index < rects.length; index += 1) {
    const rect = rects[index];
    if (!rect) continue;

    const distance = Math.abs(x - (rect.left + rect.width / 2));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }

  return best;
}

/**
 * The slot a keyboard asks for, or null when the key is not a reorder key or the
 * move would leave the strip. The arrow keys follow the strip as drawn: in RTL
 * the first tab is on the right, so ArrowLeft walks toward the end and ArrowRight
 * toward the start. `Home` and `End` mean the first and last tab, not the left
 * and right edge of the screen.
 */
export function keyboardTarget(
  from: number,
  key: string,
  length: number,
  rtl: boolean
): number | null {
  if (from < 0 || from >= length) return null;

  const to =
    key === 'ArrowLeft'
      ? rtl
        ? from + 1
        : from - 1
      : key === 'ArrowRight'
        ? rtl
          ? from - 1
          : from + 1
        : key === 'Home'
          ? 0
          : key === 'End'
            ? length - 1
            : from;

  return to === from || to < 0 || to >= length ? null : to;
}
