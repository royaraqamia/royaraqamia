'use client';

import * as React from 'react';
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

const HOURS = Array.from({ length: 12 }, (_, i) => pad2(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad2(i));

const PERIOD_LABELS: Record<TimePeriod, string> = { am: 'ص', pm: 'م' };

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  'aria-label'?: string;
  disabled?: boolean;
}

export function TimePicker({
  value,
  onChange,
  placeholder = 'الوقت',
  className,
  triggerClassName,
  'aria-label': ariaLabel = placeholder,
  disabled,
}: TimePickerProps) {
  const selected = splitHHmm(value);
  const [draft, setDraft] = React.useState<Partial<TimeParts>>({});

  React.useEffect(() => {
    setDraft({});
  }, [value]);

  const current: Partial<TimeParts> = selected ?? draft;

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
          {MINUTES.map((minute) => (
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
    </div>
  );
}
