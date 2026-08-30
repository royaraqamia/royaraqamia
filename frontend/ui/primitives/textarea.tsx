import * as React from 'react';

import { cn } from '@/frontend/shared/cn';

interface TextareaProps extends React.ComponentProps<'textarea'> {
  error?: boolean;
  maxLength?: number;
  showCount?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    { className, error, maxLength, showCount, value, defaultValue, onChange, disabled, ...props },
    ref
  ) => {
    const [charCount, setCharCount] = React.useState<number>(() => {
      if (value !== undefined && value !== null) return value.toString().length;
      if (defaultValue !== undefined && defaultValue !== null)
        return defaultValue.toString().length;
      return 0;
    });

    // Synchronize character count state with controlled value prop updates
    React.useEffect(() => {
      if (value !== undefined && value !== null) {
        setCharCount(value.toString().length);
      }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setCharCount(e.target.value.length);
      onChange?.(e);
    };

    const isNearLimit = maxLength ? charCount >= maxLength * 0.85 : false;
    const isAtLimit = maxLength ? charCount >= maxLength : false;

    return (
      <div className="group relative w-full">
        <textarea
          ref={ref}
          data-slot="textarea"
          maxLength={maxLength}
          value={value}
          defaultValue={defaultValue}
          disabled={disabled}
          spellCheck="true"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          className={cn(
            // Sizing, Padding & Responsive Typography
            'flex min-h-27.5 w-full rounded-2xl border px-4 py-3.5 text-sm sm:text-base leading-relaxed',
            // High-Contrast Typography & Text Selection
            'text-foreground placeholder:text-muted-foreground/50 selection:bg-primary/20 selection:text-primary font-sans antialiased tracking-tight',
            // Surface Styling & Modern Glassmorphism
            'bg-background/80 backdrop-blur-sm border-border/80 shadow-xs',
            // Interactive Hover & Transition States
            'hover:border-border hover:bg-background transition-all duration-200 ease-out',
            // Custom Focus Ring System (Vercel/Linear Aesthetic)
            'focus-visible:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 focus-visible:shadow-md',
            // Contextual Padding & Error State Adjustments (Prevents text overlap)
            error &&
              'pr-11 border-destructive/70 focus-visible:border-destructive focus-visible:ring-destructive/20 bg-destructive/5',
            showCount && maxLength && 'pb-10',
            // Disabled States
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/40 disabled:hover:border-border/80 disabled:shadow-none',
            // Resize Behavior
            'resize-y',
            // RTL Support
            '[dir=rtl]:text-right',
            className
          )}
          onChange={handleChange}
          {...props}
        />

        {/* Error Alert Indicator Badge */}
        {error && (
          <div
            className="absolute right-3.5 top-3.5 flex items-center justify-center text-destructive pointer-events-none transition-transform duration-200 ease-out group-hover:scale-105"
            aria-hidden="true"
          >
            <div className="flex items-center justify-center rounded-full bg-destructive/10 p-1 ring-1 ring-destructive/20 backdrop-blur-xs">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
          </div>
        )}

        {/* Floating Glassmorphic Character Counter Pill */}
        {showCount && maxLength && (
          <div
            className="absolute bottom-3 left-3.5 pointer-events-none flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-0.5 text-xs font-mono border border-border/50 shadow-2xs backdrop-blur-md transition-all duration-200 select-none"
            aria-live="polite"
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full transition-colors duration-200',
                isAtLimit
                  ? 'bg-destructive animate-pulse'
                  : isNearLimit
                    ? 'bg-amber-500'
                    : 'bg-muted-foreground/40'
              )}
            />
            <span
              className={cn(
                'transition-colors duration-200 font-medium tabular-nums',
                isAtLimit
                  ? 'text-destructive font-bold'
                  : isNearLimit
                    ? 'text-amber-500 font-medium'
                    : 'text-muted-foreground'
              )}
            >
              {charCount}
            </span>
            <span className="text-muted-foreground/30 font-sans">/</span>
            <span className="text-muted-foreground/60 tabular-nums">{maxLength}</span>
          </div>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export { Textarea, type TextareaProps };
