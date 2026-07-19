import React from 'react';
import { cn } from '@/domains/linksnap/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  const base = cn(
    'inline-flex items-center justify-center gap-2 font-medium transition-all cursor-pointer select-none',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none',
    'press-opacity focus-ring'
  );

  const variants = {
    primary:
      'bg-primary hover:bg-primary/90 text-white shadow-md shadow-primary/10 hover:shadow-primary/20',
    secondary:
      'bg-muted/50 hover:bg-muted text-foreground border border-border hover:border-border/80 shadow-sm',
    ghost: 'text-muted-foreground hover:text-foreground hover:bg-muted',
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-md',
    outline:
      'bg-transparent border border-border hover:border-primary/30 text-muted-foreground hover:text-primary',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs rounded-lg min-h-[36px]',
    md: 'px-4 py-2.5 text-sm rounded-xl min-h-[44px]',
    lg: 'px-6 py-3.5 text-sm rounded-xl min-h-[52px]',
  };

  return (
    <button
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg
          className="w-4 h-4 animate-spin shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          role="status"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
