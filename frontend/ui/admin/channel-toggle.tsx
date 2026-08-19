'use client';

import { cn } from '@/frontend/shared/cn';

interface ChannelToggleProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: string;
  icon?: React.ReactNode;
}

export function ChannelToggle({
  id,
  checked,
  onChange,
  label,
  description,
  icon,
}: ChannelToggleProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/50 p-3.5">
      <div className="flex items-center gap-3">
        {icon && (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </span>
        )}
        <div>
          <label htmlFor={id} className="block text-sm font-semibold">
            {label}
          </label>
          <p className="text-muted-foreground text-xs">{description}</p>
        </div>
      </div>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 cursor-pointer focus-ring',
          checked ? 'bg-primary border-primary' : 'bg-muted-foreground/20 border-border'
        )}
        dir="ltr"
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200',
            checked ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
    </div>
  );
}
