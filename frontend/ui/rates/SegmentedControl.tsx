'use client';

import type { ReactNode } from 'react';
import { cn } from '@/frontend/shared/cn';

export const SEGMENTED_TRACK_CLASS =
  'flex w-full rounded-xl border border-border/60 bg-muted/70 p-1';

export function segmentedItemClass(selected: boolean) {
  return cn(
    'flex-1 rounded-lg px-3 py-1.5 text-sm font-bold transition-colors',
    selected
      ? 'bg-selected text-selected-foreground shadow-sm'
      : 'text-muted-foreground hover:text-foreground'
  );
}

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
}

interface SegmentedControlProps<T extends string | number> {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onValueChange: (value: T) => void;
  className?: string;
}

export function SegmentedControl<T extends string | number>({
  label,
  value,
  options,
  onValueChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div className={cn(SEGMENTED_TRACK_CLASS, className)} role="group" aria-label={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={selected}
            onClick={() => onValueChange(option.value)}
            className={segmentedItemClass(selected)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
