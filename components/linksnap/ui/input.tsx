import React from 'react';
import { cn } from '@/domains/linksnap/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  error?: boolean;
  helperTextId?: string;
}

export function Input({
  className,
  icon,
  iconPosition = 'right',
  error = false,
  disabled,
  helperTextId,
  ...props
}: InputProps) {
  return (
    <div className="relative">
      {icon && (
        <div
          className={cn(
            'absolute top-1/2 -translate-y-1/2 w-5 h-5 text-primary pointer-events-none',
            iconPosition === 'right' ? 'right-4' : 'left-4'
          )}
        >
          {icon}
        </div>
      )}
      <input
        className={cn(
          'w-full py-3.5 border rounded-xl text-sm transition-all duration-150 focus-ring',
          'text-foreground dark:text-foreground placeholder:text-muted-foreground dark:placeholder:text-muted-foreground',
          error
            ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 focus-visible:ring-2 focus-visible:ring-red-500/20 focus-visible:border-red-500'
            : 'bg-muted/50 dark:bg-background/50 border-border dark:border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary',
          disabled && 'opacity-50 cursor-not-allowed bg-muted dark:bg-card',
          icon && iconPosition === 'right' && 'pr-12 pl-4',
          icon && iconPosition === 'left' && 'pl-12 pr-4',
          !icon && 'px-4',
          className
        )}
        disabled={disabled}
        aria-invalid={error || undefined}
        aria-describedby={helperTextId}
        {...props}
      />
    </div>
  );
}
