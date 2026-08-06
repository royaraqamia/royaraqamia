'use client';

import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
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

const triggerClassNames = cn(
  'group relative flex h-11 w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-input/80 bg-background/80 px-3.5 text-sm font-medium text-foreground shadow-xs backdrop-blur-md',
  'transition-all duration-200 ease-out',
  'hover:border-ring/50 hover:bg-background hover:shadow-md hover:scale-[1.005]',
  'focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  'data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/20 data-[state=open]:bg-background/95 data-[state=open]:shadow-md',
  'active:scale-[0.995]',
  'disabled:pointer-events-none disabled:opacity-50 disabled:bg-muted/30 disabled:border-border/40 disabled:shadow-none disabled:hover:scale-100',
  'cursor-pointer select-none'
);

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
  disabled?: boolean;
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'اختر تاريخًا',
  className,
  disabled,
  ...props
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-expanded={isOpen}
          className={cn(triggerClassNames, className)}
          {...props}
        >
          <div className="flex items-center gap-2.5 min-w-0 truncate">
            {value && (
              <span
                className="size-1.5 shrink-0 rounded-full bg-primary ring-2 ring-primary/25 transition-transform duration-200 scale-100"
                aria-hidden="true"
              />
            )}
            <span
              className={cn(
                'truncate transition-colors duration-200',
                value ? 'font-medium text-foreground' : 'font-normal text-muted-foreground/70'
              )}
            >
              {value ? formatDate(value) : placeholder}
            </span>
          </div>
          <CalendarDays
            className="size-4 shrink-0 text-muted-foreground/70 transition-colors duration-200 group-hover:text-foreground group-data-[state=open]:text-primary"
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 border border-border/80 shadow-2xl rounded-2xl bg-popover/95 backdrop-blur-xl overflow-hidden animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 duration-200"
        align="start"
      >
        <Calendar
          mode="single"
          selected={parseIsoDate(value)}
          onSelect={(date) => {
            onChange(toIsoDate(date));
            setIsOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}

export function DateRangePicker({
  from,
  to,
  onChange,
  placeholder = 'الفترة الزمنية',
  className,
  ...props
}: DateRangePickerProps) {
  const hasSelection = Boolean(from || to);

  const selected: DateRange | undefined =
    from || to ? { from: parseIsoDate(from), to: parseIsoDate(to) } : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn(triggerClassNames, className)} {...props}>
          <div className="flex items-center gap-2.5 min-w-0 truncate">
            {hasSelection && (
              <span
                className="size-1.5 shrink-0 rounded-full bg-primary ring-2 ring-primary/25 transition-transform duration-200 scale-100"
                aria-hidden="true"
              />
            )}
            <span
              className={cn(
                'truncate transition-colors duration-200',
                hasSelection
                  ? 'font-medium text-foreground'
                  : 'font-normal text-muted-foreground/70'
              )}
            >
              {hasSelection
                ? `${rangeFormatter.format(parseIsoDate(from) ?? new Date())} — ${rangeFormatter.format(parseIsoDate(to) ?? parseIsoDate(from) ?? new Date())}`
                : placeholder}
            </span>
          </div>
          <CalendarRange
            className="size-4 shrink-0 text-muted-foreground/70 transition-colors duration-200 group-hover:text-foreground group-data-[state=open]:text-primary"
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 border border-border/80 shadow-2xl rounded-2xl bg-popover/95 backdrop-blur-xl overflow-hidden animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 duration-200"
        align="start"
      >
        <Calendar
          mode="range"
          selected={selected}
          onSelect={(range) => onChange(toIsoDate(range?.from), toIsoDate(range?.to))}
          autoFocus
        />
        {hasSelection && (
          <div className="flex items-center justify-between border-t border-border/60 bg-muted/30 px-3.5 py-2.5">
            <span className="text-xs font-medium text-muted-foreground">الفترة المحددة</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange('', '')}
              className="h-7 gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:scale-95 transition-all duration-150"
            >
              <X className="size-3.5" />
              مسح
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
