'use client';

import { forwardRef, useState, type ComponentProps, type ReactNode } from 'react';
import type { DateRange, Matcher } from 'react-day-picker';
import { CalendarDays, CalendarRange, X } from 'lucide-react';
import { cn } from '@/frontend/shared/cn';
import { Popover, PopoverContent, PopoverTrigger } from '@/frontend/ui/primitives/popover';
import { Button } from '@/frontend/ui/primitives/button';
import { Calendar } from '@/frontend/ui/primitives/calendar';

const dateFormatter = new Intl.DateTimeFormat('ar', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  numberingSystem: 'latn',
});

const rangeFormatter = new Intl.DateTimeFormat('ar', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  numberingSystem: 'latn',
});

function toIsoDate(date?: Date | null): string {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseIsoDate(iso?: string | null): Date | undefined {
  if (!iso) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatDate(iso?: string | null): string {
  const date = parseIsoDate(iso);
  return date ? dateFormatter.format(date) : '';
}

function formatRange(from?: string | null, to?: string | null): string {
  const fromDate = parseIsoDate(from);
  const toDate = parseIsoDate(to);
  if (fromDate && toDate)
    return `${rangeFormatter.format(fromDate)} — ${rangeFormatter.format(toDate)}`;
  if (fromDate) return rangeFormatter.format(fromDate);
  if (toDate) return `حتى ${rangeFormatter.format(toDate)}`;
  return '';
}

const triggerClassNames = cn(
  'group relative flex h-11 w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-input/80 bg-background/80 px-3.5 text-sm font-medium text-foreground shadow-xs',
  'transition-safe duration-200 ease-out',
  'hover:border-ring/50 hover:bg-background hover:shadow-md hover:scale-[1.005]',
  'focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  'data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/20 data-[state=open]:bg-background/95 data-[state=open]:shadow-md',
  'active:scale-[0.995]',
  'disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-border/40 disabled:bg-muted/30 disabled:shadow-none disabled:hover:scale-100',
  'cursor-pointer select-none'
);

const triggerIconClassNames =
  'size-4 shrink-0 text-muted-foreground/70 transition-colors duration-200 group-hover:text-foreground group-data-[state=open]:text-primary';

const contentClassNames =
  'w-auto overflow-hidden rounded-2xl border border-border/80 bg-popover/95 p-0 shadow-2xl shadow-black/40 sm:w-auto sm:p-0';

const disabledDayMatcher = (min?: Date, max?: Date): Matcher | undefined => {
  if (min && max) return { before: min, after: max };
  if (min) return { before: min };
  if (max) return { after: max };
  return undefined;
};

interface PickerTriggerProps extends Omit<ComponentProps<'button'>, 'children'> {
  hasValue: boolean;
  placeholder: string;
  label: string;
  icon: ReactNode;
  open?: boolean;
}

const PickerTrigger = forwardRef<HTMLButtonElement, PickerTriggerProps>(function PickerTrigger(
  { hasValue, placeholder, label, icon, open, className, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-expanded={open}
      className={cn(triggerClassNames, className)}
      {...props}
    >
      <span className="flex min-w-0 items-center gap-2.5 truncate">
        <span
          aria-hidden="true"
          className={cn(
            'size-1.5 shrink-0 rounded-full bg-primary ring-2 ring-primary/25 transition-transform duration-200',
            hasValue ? 'scale-100' : 'scale-0'
          )}
        />
        <span
          className={cn(
            'truncate transition-colors duration-200',
            hasValue ? 'font-medium text-foreground' : 'font-normal text-muted-foreground/70'
          )}
        >
          {hasValue ? label : placeholder}
        </span>
      </span>
      {icon}
    </button>
  );
});

function PickerFooter({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-muted/30 px-3.5 py-2.5">
      <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClear}
        className="h-7 shrink-0 gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-safe duration-150 hover:bg-destructive/10 hover:text-destructive active:scale-95"
      >
        <X className="size-3.5" />
        مسح
      </Button>
    </div>
  );
}

type DatePickerProps = Omit<
  ComponentProps<'button'>,
  'value' | 'onChange' | 'defaultValue' | 'children' | 'type'
> & {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** ISO date (`YYYY-MM-DD`); earlier dates are not selectable. */
  min?: string;
  /** ISO date (`YYYY-MM-DD`); later dates are not selectable. */
  max?: string;
  /** ISO date (`YYYY-MM-DD`) of the month shown when the picker opens. Falls back to the current value, then today. */
  defaultMonth?: string;
  /** Show a clear action when a date is selected. */
  clearable?: boolean;
};

export function DatePicker({
  value,
  onChange,
  placeholder = 'اختر تاريخًا',
  className,
  min,
  max,
  defaultMonth,
  clearable = true,
  ...props
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const label = formatDate(value);
  const disabledDays = disabledDayMatcher(parseIsoDate(min), parseIsoDate(max));
  const shownMonth = parseIsoDate(defaultMonth) ?? parseIsoDate(value);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <PickerTrigger
          hasValue={Boolean(value)}
          placeholder={placeholder}
          label={label}
          open={isOpen}
          icon={<CalendarDays className={triggerIconClassNames} aria-hidden="true" />}
          className={className}
          {...props}
        />
      </PopoverTrigger>
      <PopoverContent className={contentClassNames} align="start">
        <Calendar
          mode="single"
          selected={parseIsoDate(value)}
          onSelect={(date) => {
            onChange(toIsoDate(date));
            setIsOpen(false);
          }}
          disabled={disabledDays}
          defaultMonth={shownMonth}
          autoFocus
        />
        {clearable && value && (
          <PickerFooter
            label={label}
            onClear={() => {
              onChange('');
              setIsOpen(false);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

type DateRangePickerProps = Omit<
  ComponentProps<'button'>,
  'value' | 'onChange' | 'defaultValue' | 'children' | 'type'
> & {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  placeholder?: string;
  /** ISO date (`YYYY-MM-DD`); earlier dates are not selectable. */
  min?: string;
  /** ISO date (`YYYY-MM-DD`); later dates are not selectable. */
  max?: string;
  /** ISO date (`YYYY-MM-DD`) of the month shown when the picker opens. Falls back to `from`/`to`, then today. */
  defaultMonth?: string;
  /** Show a clear action when a range is selected. */
  clearable?: boolean;
};

export function DateRangePicker({
  from,
  to,
  onChange,
  placeholder = 'الفترة الزمنية',
  className,
  min,
  max,
  defaultMonth,
  clearable = true,
  ...props
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hasSelection = Boolean(from || to);
  const label = formatRange(from, to);
  const disabledDays = disabledDayMatcher(parseIsoDate(min), parseIsoDate(max));
  const shownMonth = parseIsoDate(defaultMonth) ?? parseIsoDate(from) ?? parseIsoDate(to);

  const selected: DateRange | undefined =
    from || to ? { from: parseIsoDate(from), to: parseIsoDate(to) } : undefined;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <PickerTrigger
          hasValue={hasSelection}
          placeholder={placeholder}
          label={label}
          open={isOpen}
          icon={<CalendarRange className={triggerIconClassNames} aria-hidden="true" />}
          className={className}
          {...props}
        />
      </PopoverTrigger>
      <PopoverContent className={contentClassNames} align="start">
        <Calendar
          mode="range"
          selected={selected}
          onSelect={(range) => onChange(toIsoDate(range?.from), toIsoDate(range?.to))}
          disabled={disabledDays}
          defaultMonth={shownMonth}
          autoFocus
        />
        {clearable && hasSelection && (
          <PickerFooter
            label="الفترة المحددة"
            onClear={() => {
              onChange('', '');
              setIsOpen(false);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
