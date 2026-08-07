import type { ClassNames } from 'react-day-picker';
import { DayPicker } from 'react-day-picker';
import { ar } from 'react-day-picker/locale';
import { cn } from '@/frontend/shared/cn';

const calendarClassNames: Partial<ClassNames> = {
  root: cn(
    'relative p-4 sm:p-5 rounded-2xl border border-border/80 bg-card/95 backdrop-blur-xl',
    'shadow-xl shadow-black/5 dark:shadow-black/40 text-card-foreground select-none transition-all duration-300 w-fit'
  ),
  months: 'relative flex flex-col sm:flex-row gap-5 sm:gap-7',
  month: 'relative space-y-4 w-full',
  nav: 'flex items-center justify-between absolute inset-x-0 top-0 z-10 h-9 pointer-events-none px-0.5',
  button_previous: cn(
    'pointer-events-auto inline-flex items-center justify-center size-8 rounded-lg bg-background/80 hover:bg-accent hover:text-accent-foreground text-muted-foreground/80',
    'border border-border/60 hover:border-border shadow-xs hover:shadow-md transition-all duration-200 ease-out hover:scale-105 active:scale-95',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-30 cursor-pointer'
  ),
  button_next: cn(
    'pointer-events-auto inline-flex items-center justify-center size-8 rounded-lg bg-background/80 hover:bg-accent hover:text-accent-foreground text-muted-foreground/80',
    'border border-border/60 hover:border-border shadow-xs hover:shadow-md transition-all duration-200 ease-out hover:scale-105 active:scale-95',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-30 cursor-pointer'
  ),
  chevron: 'size-4 transition-transform duration-200 ease-out group-hover:scale-110',
  month_caption: 'flex items-center justify-center h-9 relative px-8',
  caption_label: 'text-sm font-semibold tracking-tight text-foreground select-none',
  month_grid: 'w-full border-collapse space-y-1',
  weekdays: 'flex items-center justify-between pb-1.5 mb-1 border-b border-border/40',
  weekday:
    'size-9 flex items-center justify-center text-[0.75rem] font-semibold tracking-wider text-muted-foreground/70 uppercase select-none',
  weeks: 'space-y-1',
  week: 'flex w-full items-center justify-between mt-1',
  day: cn(
    'group relative size-9 p-0 text-center text-sm focus-within:z-20',
    'data-[outside]:opacity-35 data-[disabled]:opacity-25'
  ),
  day_button: cn(
    'inline-flex items-center justify-center size-9 rounded-lg p-0 font-medium text-foreground text-sm',
    'transition-all duration-200 ease-out cursor-pointer select-none',
    'hover:bg-accent hover:text-accent-foreground hover:scale-105 active:scale-95',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-30',
    // Selection state
    'group-data-[selected=true]:bg-primary group-data-[selected=true]:text-primary-foreground group-data-[selected=true]:font-semibold',
    'group-data-[selected=true]:shadow-md group-data-[selected=true]:shadow-primary/25',
    'group-data-[selected=true]:hover:bg-primary/90 group-data-[selected=true]:hover:scale-100',
    'group-data-[selected=true]:focus-visible:bg-primary group-data-[selected=true]:focus-visible:text-primary-foreground',
    // Today indicator
    'group-[.today]:font-bold group-[.today]:text-primary group-[.today]:ring-1.5 group-[.today]:ring-primary/50 group-[.today]:bg-primary/10',
    'group-data-[today=true]:font-bold group-data-[today=true]:text-primary group-data-[today=true]:ring-1.5 group-data-[today=true]:ring-primary/50 group-data-[today=true]:bg-primary/10',
    // Range selection styling
    'group-[.range_start]:rounded-s-lg group-[.range_start]:rounded-e-none',
    'group-[.range_middle]:rounded-none group-[.range_middle]:bg-primary/15 group-[.range_middle]:text-primary group-[.range_middle]:hover:bg-primary/25',
    'group-[.range_end]:rounded-e-lg group-[.range_end]:rounded-s-none'
  ),
  hidden: 'invisible',
  outside: 'outside text-muted-foreground/40',
  disabled: 'disabled text-muted-foreground/30 line-through pointer-events-none',
  today: 'today',
  focused: 'focused',
  selected: 'selected',
  range_start: 'range_start',
  range_middle: 'range_middle',
  range_end: 'range_end',
};

type CalendarProps = React.ComponentProps<typeof DayPicker> & { className?: string };

export function Calendar({ className, classNames, ...props }: CalendarProps) {
  return (
    <DayPicker
      dir="rtl"
      locale={ar}
      showOutsideDays={props.mode === 'range'}
      className={cn('w-fit', className)}
      classNames={{ ...calendarClassNames, ...classNames }}
      {...props}
    />
  );
}
