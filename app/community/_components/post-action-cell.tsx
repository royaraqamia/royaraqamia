import { cn } from '@/frontend/shared/cn';

/**
 * The one control in the bar (#1573).
 *
 * Every action — like, comment, share, the owner's menu — is the same cell: a
 * 40px hit area, an 18px glyph, one radius, one hover. What differs is emphasis,
 * never shape, because a row where two controls are discs and two are bare reads
 * as two toolbars stacked on each other.
 *
 * `relative z-20` is not decoration: the card is one big link with an `inset-0`
 * overlay, so every control has to sit above it to be pressable.
 */
export const ACTION_CELL_CLASS =
  'relative z-20 inline-flex h-10 min-w-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-bold text-muted-foreground transition-safe duration-150 ease-out hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50';

/**
 * A count beside a control, or nothing at all.
 *
 * Zero draws nothing, for the reason `PostViews` already gives: a row of zeroes
 * is what makes a young feed look abandoned. The number arrives after the page's
 * batched read, so a control without one is "not answered yet", never a zero.
 */
export function PostActionCount({ value }: { value: number | undefined }) {
  if (value === undefined || value <= 0) return null;

  const label = value.toLocaleString('en-US');

  return (
    <span className="font-digits" dir="ltr" aria-hidden="true">
      {label}
    </span>
  );
}

/** The cell's own classes, for a host that draws its own element (a Radix trigger). */
export function actionCellClass(className?: string) {
  return cn(ACTION_CELL_CLASS, className);
}
