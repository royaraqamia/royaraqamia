import * as React from 'react';

import { cn } from '@/lib/utils';

interface TextareaProps extends React.ComponentProps<'textarea'> {
  error?: boolean;
  maxLength?: number;
  showCount?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, maxLength, showCount, ...props }, ref) => {
    const [charCount, setCharCount] = React.useState(props.value?.toString().length || 0);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setCharCount(e.target.value.length);
      props.onChange?.(e);
    };

    return (
      <div className="relative">
        <textarea
          ref={ref}
          data-slot="textarea"
          maxLength={maxLength}
          spellCheck="true"
          autoComplete="off"
          className={cn(
            // Base styles - optimized spacing and sizing
            'flex min-h-25 w-full rounded-xl border border-input bg-background px-3.5 py-3 text-base leading-relaxed',
            // Typography and selection
            'placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground',
            // Enhanced focus states with premium ring and transitions
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:border-ring',
            'focus-visible:shadow-md',
            // Disabled states
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/50',
            // Resize behavior
            'resize-y',
            // Enhanced error states with better visual feedback
            error && 'border-destructive/80 bg-destructive/5 focus-visible:ring-destructive/30',
            // Premium hover effects with subtle lift
            'hover:border-ring/30 hover:shadow-sm',
            // Premium transition for all state changes
            'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
            // RTL support
            '[dir=rtl]:text-right',
            // Enhanced shadow system
            'shadow-sm',
            className
          )}
          onChange={handleChange}
          {...props}
        />
        {error && (
          <div className="absolute right-3 top-3 text-destructive">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
        )}
        {showCount && maxLength && (
          <div className="absolute bottom-3 left-3.5 text-xs text-muted-foreground flex items-center gap-1">
            <span
              className={`transition-colors ${charCount >= maxLength * 0.9 ? 'text-warning' : ''}`}
            >
              {charCount}
            </span>
            <span className="text-muted-foreground/50">/</span>
            <span>{maxLength}</span>
          </div>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export { Textarea, type TextareaProps };
