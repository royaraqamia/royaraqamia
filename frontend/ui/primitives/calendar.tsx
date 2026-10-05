import {
  Chevron as RdpChevron,
  DayButton as RdpDayButton,
  DayPicker,
  type ChevronProps,
  type ClassNames,
  type DayButtonProps,
  type Modifiers,
} from 'react-day-picker';
import { ar } from 'react-day-picker/locale';
import { cn } from '@/frontend/shared/cn';

const navButtonClassNames = cn(
  'pointer-events-auto group inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-foreground/85',
  'transition-safe duration-200 ease-out hover:bg-accent hover:text-foreground active:scale-95',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  'disabled:pointer-events-none disabled:opacity-30'
);

const dayButtonClassNames = cn(
  'inline-flex size-9 cursor-pointer select-none items-center justify-center rounded-lg p-0 text-sm font-medium text-foreground',
  'transition-safe duration-200 ease-out hover:scale-105 hover:bg-accent hover:text-accent-foreground active:scale-95',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  'disabled:pointer-events-none disabled:opacity-30'
);

/* Day state is resolved from `modifiers` rather than layered `group-*` selectors:
   a day can be both `selected` and `range_middle`, and competing
   `group-data-[selected]` / `group-[.range_middle]` utilities resolve by
   stylesheet order rather than intent. Explicit modifiers make precedence clear. */
function dayStateClassNames(modifiers: Modifiers): string {
  const { selected, range_middle, range_start, range_end, today, disabled, outside } = modifiers;
  return cn(
    outside && 'text-muted-foreground/40',
    disabled && 'line-through',
    today &&
      !selected &&
      'bg-primary/10 font-bold text-primary ring-1 ring-primary/40 hover:bg-primary/20',
    range_middle && 'rounded-none bg-primary/15 text-primary hover:bg-primary/25',
    range_start && 'rounded-s-lg rounded-e-none',
    range_end && 'rounded-e-lg rounded-s-none',
    selected &&
      !range_middle &&
      /* `--primary` (L 67%) leaves white text at ~3.7:1 — under AA for the 14px
         day digits. The solid selected fill therefore uses `--accent-purple`
         (same 256 hue, L 55%), whose white foreground clears AA at ~6.8:1. */
      'bg-accent-purple font-bold text-accent-purple-foreground shadow-md shadow-accent-purple/30 hover:scale-100 hover:bg-accent-purple/90'
  );
}

function CalendarDayButton({ modifiers, className, ...props }: DayButtonProps) {
  return (
    <RdpDayButton
      modifiers={modifiers}
      className={cn(dayButtonClassNames, dayStateClassNames(modifiers), className)}
      {...props}
    />
  );
}

/* react-day-picker's standalone `Nav` hardcodes the chevron orientation
   ("left" for previous, "right" for next) without consulting `dir`, so both
   glyphs render mirrored under RTL. The buttons are already laid out correctly
   by `justify-between` (previous at the right edge, next at the left), so only
   the glyph needs flipping: previous must point right, next must point left. */
function CalendarChevron({ orientation, ...props }: ChevronProps) {
  const mirrored =
    orientation === 'left' ? 'right' : orientation === 'right' ? 'left' : orientation;
  return <RdpChevron orientation={mirrored} {...props} />;
}

const calendarClassNames: Partial<ClassNames> = {
  root: cn(
    'relative w-fit select-none rounded-2xl border border-border/80 bg-card/95 p-4 text-card-foreground',
    'shadow-xl shadow-black/40 transition-safe duration-300 sm:p-5'
  ),
  months: 'relative flex flex-col gap-5 sm:flex-row sm:gap-7',
  month: 'relative w-full space-y-4',
  /* Overriding `classNames` replaces react-day-picker's defaults rather than
     merging them, so the nav loses its built-in `rdp-nav` hook. That hook is
     what `app/dark-theme-override.css` excludes from its global
     `nav { background-color: hsl(var(--background) / 0.95) }` rule; without it
     the nav paints an opaque slab over the month caption. Keep `rdp-nav`
     explicitly. */
  nav: 'rdp-nav pointer-events-none absolute inset-x-0 top-0 z-10 flex h-9 items-center justify-between px-0.5',
  button_previous: navButtonClassNames,
  button_next: navButtonClassNames,
  /* `fill-current` is required: react-day-picker's own stylesheet (never
     imported here) sets `.rdp-chevron { fill: var(--rdp-accent-color) }`, and our
     override replaces that class, so the `<polygon>` falls back to SVG's default
     black fill and ignores the button's text color. */
  chevron: 'size-4 fill-current transition-transform duration-200 ease-out group-hover:scale-110',
  month_caption: 'relative flex h-9 items-center justify-center px-8',
  caption_label: 'select-none text-sm font-bold tracking-tight text-foreground',
  month_grid: 'w-full border-collapse',
  weekdays: 'mb-1 flex items-center justify-between border-b border-border/40 pb-1.5',
  /* 12px bold uppercase counts as small text (AA needs 4.5:1). At `--muted-foreground`
     full strength this is 7.7:1 on `--card`; the old /70 landed at 4.46:1, just
     under. /80 sits at 5.4:1 — comfortably AA while still reading as subdued. */
  weekday:
    'flex size-9 select-none items-center justify-center text-[0.75rem] font-bold tracking-wider text-muted-foreground/80 uppercase',
  weeks: 'space-y-1',
  week: 'flex w-full items-center justify-between',
  day: 'relative size-9 p-0 text-center text-sm focus-within:z-20',
  hidden: 'invisible',
};

/* Defaults target this app (RTL, Arabic, and outside days shown only in range
   mode so single mode stays uncluttered). All three stay overridable via props. */
type CalendarProps = React.ComponentProps<typeof DayPicker> & { className?: string };

export function Calendar({ className, classNames, components, ...props }: CalendarProps) {
  return (
    <DayPicker
      dir="rtl"
      locale={ar}
      showOutsideDays={props.showOutsideDays ?? props.mode === 'range'}
      className={cn('w-fit', className)}
      classNames={{ ...calendarClassNames, ...classNames }}
      components={{ DayButton: CalendarDayButton, Chevron: CalendarChevron, ...components }}
      {...props}
    />
  );
}
