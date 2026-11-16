'use client';

import * as React from 'react';

import { cn } from '@/frontend/shared/cn';

export interface SwitchProps extends Omit<React.ComponentProps<'button'>, 'onChange' | 'type'> {
  /** The state the switch is in, drawn and announced. */
  checked: boolean;
  /** The switch's own sentence, the only thing a screen reader hears. */
  label: string;
  /** The state the member asked for, already inverted. */
  onChange: (checked: boolean) => void;
}

/**
 * The site's one switch.
 *
 * The gradient track and the travelling knob came from the device-notifications
 * row, and the memory page's own small toggle was a second design for the same
 * control. One component is what stops the two drifting again: a new switch picks
 * the look up instead of drawing it.
 *
 * `dir="ltr"` is deliberate — the knob's travel is a physical distance, and a
 * page in RTL would otherwise move it the other way — while the label and the
 * `aria-checked` state stay in the document's own direction.
 */
export function Switch({ checked, label, onChange, disabled, className, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      dir="ltr"
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border px-1 transition-colors focus-ring',
        'disabled:cursor-not-allowed disabled:opacity-60',
        checked
          ? 'border-white/20 bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600'
          : 'border-border/70 bg-muted',
        className
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block size-5 rounded-full bg-background shadow-sm transition-transform duration-200',
          checked ? 'translate-x-0' : 'translate-x-[18px]'
        )}
      />
    </button>
  );
}
