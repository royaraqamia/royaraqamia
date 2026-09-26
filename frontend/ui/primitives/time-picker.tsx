'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/ui/primitives/select';
import { cn } from '@/frontend/shared/cn';

export type TimePeriod = 'am' | 'pm';

interface TimeParts {
  hour12: string;
  minute: string;
  period: TimePeriod;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function splitHHmm(value: string): TimeParts | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  const [, h, m] = match;
  if (!h || !m) return null;
  const hour24 = Number(h);
  const period: TimePeriod = hour24 >= 12 ? 'pm' : 'am';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12: pad2(hour12), minute: m, period };
}

export function joinHHmm(hour12: string, minute: string, period: TimePeriod): string {
  const hour24 = (Number(hour12) % 12) + (period === 'pm' ? 12 : 0);
  return `${pad2(hour24)}:${minute}`;
}

/* Minute options for a given increment. `include` keeps a controlled value
   selectable even when it does not land on the step (e.g. 07 past with a
   15-minute step), so a valid `value` always has a matching option. */
export function getMinuteOptions(step = 1, include?: string): string[] {
  const size = Math.min(60, Math.max(1, Math.floor(step)));
  const options = new Set<string>();
  for (let minute = 0; minute < 60; minute += size) options.add(pad2(minute));
  if (include && /^[0-5]\d$/.test(include)) options.add(include);
  return Array.from(options).sort();
}

const HOURS = Array.from({ length: 12 }, (_, i) => pad2(i + 1));

const PERIOD_LABELS: Record<TimePeriod, string> = { am: 'ص', pm: 'م' };

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  'aria-label'?: string;
  disabled?: boolean;
  /** Minute increment between options (default `1`). */
  minuteStep?: number;
  /** Show a clear action when a time is selected. */
  clearable?: boolean;
}

export function TimePicker({
  value,
  onChange,
  placeholder = 'الوقت',
  className,
  triggerClassName,
  'aria-label': ariaLabel = placeholder,
  disabled,
  minuteStep = 1,
  clearable = true,
}: TimePickerProps) {
  const selected = splitHHmm(value);
  const [draft, setDraft] = React.useState<Partial<TimeParts>>({});

  React.useEffect(() => {
    setDraft({});
  }, [value]);

  const current: Partial<TimeParts> = selected ?? draft;
  const minutes = React.useMemo(
    () => getMinuteOptions(minuteStep, selected?.minute),
    [minuteStep, selected?.minute]
  );

  const select = (patch: Partial<TimeParts>) => {
    const next = { ...current, ...patch };
    if (next.hour12 && next.minute && next.period) {
      onChange(joinHHmm(next.hour12, next.minute, next.period));
    } else {
      setDraft(next);
    }
  };

  const baseTrigger = cn('w-auto', triggerClassName);

  return (
    <div role="group" aria-label={ariaLabel} className={cn('flex items-center gap-1.5', className)}>
      <Select
        value={current.hour12 ?? ''}
        onValueChange={(v) => select({ hour12: v })}
        disabled={disabled}
      >
        <SelectTrigger aria-label={`${ariaLabel} — الساعة`} className={baseTrigger}>
          <SelectValue placeholder="ساعة" />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {HOURS.map((hour) => (
            <SelectItem key={hour} value={hour}>
              {hour}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={current.minute ?? ''}
        onValueChange={(v) => select({ minute: v })}
        disabled={disabled}
      >
        <SelectTrigger aria-label={`${ariaLabel} — الدقيقة`} className={baseTrigger}>
          <SelectValue placeholder="دقيقة" />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {minutes.map((minute) => (
            <SelectItem key={minute} value={minute}>
              {minute}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={current.period ?? ''}
        onValueChange={(v) => select({ period: v as TimePeriod })}
        disabled={disabled}
      >
        <SelectTrigger aria-label={`${ariaLabel} — صباحاً أو مساءً`} className={baseTrigger}>
          <SelectValue placeholder="ص/م" />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(PERIOD_LABELS) as TimePeriod[]).map((period) => (
            <SelectItem key={period} value={period}>
              {PERIOD_LABELS[period]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {clearable && value && (
        <button
          type="button"
          onClick={() => onChange('')}
          disabled={disabled}
          aria-label={`${ariaLabel} — مسح`}
          className={cn(
            'inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground/70',
            'transition-safe duration-150 ease-out hover:bg-destructive/10 hover:text-destructive active:scale-95',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:pointer-events-none disabled:opacity-40'
          )}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
