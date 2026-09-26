import type { ClassNames, DayButtonProps, Modifiers } from 'react-day-picker';
import { DayButton as RdpDayButton, DayPicker } from 'react-day-picker';
import { ar } from 'react-day-picker/locale';
import { cn } from '@/frontend/shared/cn';

const navButtonClassNames = cn(
  'pointer-events-auto group inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border border-border/60 bg-background/80 text-muted-foreground/80 shadow-xs',
  'transition-safe duration-200 ease-out hover:scale-105 hover:border-border hover:bg-accent hover:text-accent-foreground hover:shadow-md active:scale-95',
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

const calendarClassNames: Partial<ClassNames> = {
  root: cn(
    'relative w-fit select-none rounded-2xl border border-border/80 bg-card/95 p-4 text-card-foreground',
    'shadow-xl shadow-black/40 transition-safe duration-300 sm:p-5'
  ),
  months: 'relative flex flex-col gap-5 sm:flex-row sm:gap-7',
  month: 'relative w-full space-y-4',
  nav: 'pointer-events-none absolute inset-x-0 top-0 z-10 flex h-9 items-center justify-between px-0.5',
  button_previous: navButtonClassNames,
  button_next: navButtonClassNames,
  chevron: 'size-4 transition-transform duration-200 ease-out group-hover:scale-110',
  month_caption: 'relative flex h-9 items-center justify-center px-8',
  caption_label: 'select-none text-sm font-bold tracking-tight text-foreground',
  month_grid: 'w-full border-collapse',
  weekdays: 'mb-1 flex items-center justify-between border-b border-border/40 pb-1.5',
  weekday:
    'flex size-9 select-none items-center justify-center text-[0.75rem] font-bold tracking-wider text-muted-foreground/70 uppercase',
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
      components={{ DayButton: CalendarDayButton, ...components }}
      {...props}
    />
  );
}
