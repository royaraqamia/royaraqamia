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
            'flex min-h-[100px] w-full rounded-lg border border-input bg-background px-3.5 py-3 text-sm leading-relaxed',
            // Typography and selection
            'placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground',
            // Focus states - improved accessibility
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:border-ring',
            // Disabled states
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/50',
            // Resize behavior
            'resize-y',
            // Error states
            error &&
              'border-destructive focus-visible:ring-destructive/50 focus-visible:border-destructive',
            // Hover effects
            'hover:border-ring/50 transition-all duration-200 ease-in-out',
            // RTL support
            '[dir=rtl]:text-right',
            // Shadow for depth
            'shadow-sm focus-visible:shadow-md',
            className
          )}
          onChange={handleChange}
          {...props}
        />
        {showCount && maxLength && (
          <div className="absolute bottom-3 left-3.5 text-xs text-muted-foreground">
            {charCount}/{maxLength}
          </div>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export { Textarea, type TextareaProps };
