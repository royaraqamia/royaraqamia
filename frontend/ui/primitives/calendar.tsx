import type { ClassNames } from 'react-day-picker';
import { DayPicker } from 'react-day-picker';
import { ar } from 'react-day-picker/locale';
import { cn } from '@/frontend/shared/cn';

const calendarClassNames: Partial<ClassNames> = {
  root: 'p-3',
  months: 'relative flex flex-col gap-2.5',
  month: 'relative space-y-2.5',
  nav: 'flex items-center justify-between',
  button_previous: cn(
    'absolute inset-y-0 start-1 z-10 size-7 rounded-full bg-transparent p-0 text-muted-foreground/60',
    'hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40'
  ),
  button_next: cn(
    'absolute inset-y-0 end-1 z-10 size-7 rounded-full bg-transparent p-0 text-muted-foreground/60',
    'hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40'
  ),
  chevron: 'size-4',
  month_caption: 'flex items-center justify-center pt-0.5',
  caption_label: 'text-sm font-medium text-foreground',
  month_grid: 'w-full border-collapse',
  weekdays: '',
  weekday: 'size-9 text-xs font-medium text-muted-foreground/80',
  weeks: '',
  week: '',
  day: cn(
    'group relative size-9 p-0 text-center text-sm focus-within:z-20',
    'data-[outside]:opacity-40 data-[disabled]:opacity-40'
  ),
  day_button: cn(
    'size-9 rounded-full p-0 font-normal text-foreground',
    'hover:bg-accent hover:text-accent-foreground',
    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-40',
    'group-data-[selected=true]:bg-primary group-data-[selected=true]:text-primary-foreground',
    'group-data-[selected=true]:hover:bg-primary/90',
    'group-data-[selected=true]:focus-visible:bg-primary group-data-[selected=true]:focus-visible:text-primary-foreground',
    'group-data-[today=true]:ring-2 group-data-[today=true]:ring-inset group-data-[today=true]:ring-primary/40',
    'group-[.range_start]:rounded-s-full',
    'group-[.range_middle]:rounded-none group-[.range_end]:rounded-e-full'
  ),
  hidden: 'invisible',
  outside: '',
  disabled: '',
  today: '',
  focused: '',
  selected: '',
  range_start: '',
  range_middle: '',
  range_end: '',
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
