'use client';

import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/frontend/shared/cn';
import { Popover, PopoverContent, PopoverTrigger } from '@/frontend/ui/primitives/popover';
import { formatHijriDate } from '@/frontend/shared/format';
import {
  HIJRI_MONTHS,
  fromHijriParts,
  hijriMonthLength,
  hijriToIso,
  isoToHijri,
  toHijriParts,
  type HijriParts,
} from '@/frontend/shared/hijri';

const WEEKDAYS = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'] as const;

interface HijriDatePickerProps {
  /** ISO date (`YYYY-MM-DD`). */
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  /** ISO date (`YYYY-MM-DD`); earlier days are not selectable. */
  min?: string;
  id?: string;
  className?: string;
}

function shiftMonth(current: HijriParts, delta: number): HijriParts {
  const month = current.month + delta;
  if (month < 1) return { year: current.year - 1, month: 12, day: 1 };
  if (month > 12) return { year: current.year + 1, month: 1, day: 1 };
  return { year: current.year, month, day: 1 };
}

/**
 * A month grid in the Umm al-Qura calendar — the calendar the site already
 * renders every date in. The stored value stays an ISO day, so the schedule
 * endpoint keeps receiving an instant; only the surface is Hijri.
 */
export function HijriDatePicker({
  value,
  onChange,
  placeholder = 'اختر تاريخًا',
  min,
  id,
  className,
}: HijriDatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? isoToHijri(value) : null;
  const [shown, setShown] = useState<HijriParts>(() => selected ?? toHijriParts(new Date()));

  const days = hijriMonthLength(shown.year, shown.month);
  const first = fromHijriParts({ year: shown.year, month: shown.month, day: 1 });
  const leading = first.getUTCDay();
  const minIso = min ?? null;

  const pick = (day: number) => {
    onChange(hijriToIso({ year: shown.year, month: shown.month, day }));
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && selected) setShown(selected);
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          aria-expanded={open}
          aria-label={value ? formatHijriDate(`${value}T00:00:00.000Z`) : placeholder}
          className={cn(
            'group flex h-11 w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-input/80 bg-background/80 px-3.5 text-sm font-medium text-foreground shadow-xs transition-safe duration-200 hover:border-ring/50 hover:bg-background focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25',
            className
          )}
        >
          <span className={value ? 'truncate' : 'truncate text-muted-foreground/70'}>
            {value ? formatHijriDate(`${value}T00:00:00.000Z`) : placeholder}
          </span>
          <CalendarDays className="size-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-auto overflow-hidden rounded-2xl border border-border/80 bg-popover p-0 shadow-2xl"
        align="start"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/50 px-3 py-2.5">
          <button
            type="button"
            onClick={() => setShown((current) => shiftMonth(current, -1))}
            aria-label="الشهر السابق"
            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-safe hover:bg-accent hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </button>
          <span className="text-sm font-bold text-foreground">
            {HIJRI_MONTHS[shown.month - 1]} {shown.year}
          </span>
          <button
            type="button"
            onClick={() => setShown((current) => shiftMonth(current, 1))}
            aria-label="الشهر التالي"
            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-safe hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-0.5 px-2 pt-2 text-center">
          {WEEKDAYS.map((label) => (
            <span key={label} className="py-1 text-[10px] font-bold text-muted-foreground">
              {label}
            </span>
          ))}
          {Array.from({ length: leading }, (_, index) => (
            <span key={`lead-${index}`} />
          ))}
          {Array.from({ length: days }, (_, index) => {
            const day = index + 1;
            const iso = hijriToIso({ year: shown.year, month: shown.month, day });
            const isSelected =
              selected?.year === shown.year &&
              selected?.month === shown.month &&
              selected?.day === day;
            const isDisabled = minIso !== null && iso < minIso;

            return (
              <button
                key={day}
                type="button"
                disabled={isDisabled}
                aria-pressed={isSelected}
                onClick={() => pick(day)}
                className={cn(
                  'inline-flex size-9 items-center justify-center rounded-lg text-sm font-medium transition-safe',
                  isSelected
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-foreground hover:bg-accent',
                  isDisabled && 'pointer-events-none text-muted-foreground/35 line-through'
                )}
              >
                {day}
              </button>
            );
          })}
        </div>
        <div className="h-2" />
      </PopoverContent>
    </Popover>
  );
}
