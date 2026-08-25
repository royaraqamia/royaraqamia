import * as React from 'react';

import { cn } from '@/frontend/shared/cn';

interface InputProps extends React.ComponentProps<'input'> {
  error?: boolean;
}

const LATIN_DIGIT_TYPES = new Set(['number', 'time', 'date', 'datetime-local', 'month', 'week']);
const LATIN_DIGIT_LANG = 'ar-u-nu-latn';

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <div className="relative w-full">
        <input
          type={type}
          ref={ref}
          data-slot="input"
          data-error={error ? 'true' : undefined}
          aria-invalid={error ? 'true' : props['aria-invalid']}
          autoComplete={getAutoComplete(type, props.name)}
          spellCheck={type === 'text' || type === 'textarea' ? 'true' : 'false'}
          className={cn(
            // Base Layout & Dimensions (44px WCAG touch target height)
            'flex h-11 w-full rounded-xl border border-input/80 bg-background/80 backdrop-blur-xs text-sm sm:text-base text-foreground font-normal',
            'py-2 pe-3.5 transition-all duration-200 ease-out',
            // Dynamic Logical Padding (prevents text overlap when error icon is active)
            error ? 'ps-10' : 'ps-3.5',
            // Typography & Text Selection Aesthetics
            'placeholder:text-muted-foreground/60 selection:bg-primary/15 selection:text-primary tracking-tight',
            // Multi-layered Shadow System
            'shadow-2xs',
            // Interactive Hover & Focus Halo Effects
            'hover:border-ring/40 hover:bg-background hover:shadow-xs',
            'focus-visible:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 focus-visible:bg-background focus-visible:shadow-xs',
            // Disabled State Precision
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/30 disabled:border-border/50 disabled:shadow-none hover:disabled:border-border/50 hover:disabled:bg-muted/30',
            // File Upload Styling
            'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground file:me-3 file:cursor-pointer',
            // High-Contrast Error State Overrides
            error && [
              'border-destructive/70 bg-destructive/3',
              'hover:border-destructive/90',
              'focus-visible:border-destructive focus-visible:ring-destructive/20',
            ],
            // Bi-directional & Logical Text Alignment
            'text-start',
            className
          )}
          {...props}
          lang={type !== undefined && LATIN_DIGIT_TYPES.has(type) ? LATIN_DIGIT_LANG : props.lang}
        />
        {error && (
          <div
            className="pointer-events-none absolute inset-s-3.5 top-1/2 -translate-y-1/2 text-destructive transition-transform duration-200 ease-out"
            aria-hidden="true"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4 shrink-0"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
        )}
      </div>
    );
  }
);

// Auto-complete helper for better UX and SEO
function getAutoComplete(type?: string, name?: string): string {
  if (!type && !name) return 'off';

  const nameStr = name?.toLowerCase() || '';
  const typeStr = type?.toLowerCase() || '';

  // Email fields
  if (typeStr === 'email' || nameStr.includes('email')) return 'email';

  // Phone fields
  if (typeStr === 'tel' || nameStr.includes('phone') || nameStr.includes('tel')) return 'tel';

  // Name fields
  if (nameStr.includes('name') || nameStr.includes('اسم')) return 'name';

  // Organization fields
  if (nameStr.includes('company') || nameStr.includes('organization') || nameStr.includes('شركة'))
    return 'organization';

  // Job title fields
  if (nameStr.includes('title') || nameStr.includes('position') || nameStr.includes('منصب'))
    return 'organization-title';

  // URL fields
  if (typeStr === 'url' || nameStr.includes('website') || nameStr.includes('url')) return 'url';

  return 'off';
}

Input.displayName = 'Input';

export { Input, type InputProps };
