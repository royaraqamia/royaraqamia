import * as React from 'react';

import { cn } from '@/lib/utils';

interface InputProps extends React.ComponentProps<'input'> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <div className="relative">
        <input
          type={type}
          ref={ref}
          data-slot="input"
          autoComplete={getAutoComplete(type, props.name)}
          spellCheck={type === 'text' || type === 'textarea' ? 'true' : 'false'}
          className={cn(
            // Base styles - optimized touch target and spacing
            'flex h-12 w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-base leading-tight',
            // Typography and selection
            'placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground',
            // Enhanced focus states with premium ring and transitions
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:border-ring',
            'focus-visible:shadow-md',
            // Disabled states
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/50',
            // File input styles
            'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground file:mr-3',
            // Enhanced error states with better visual feedback
            error &&
              'border-destructive/80 bg-destructive/5 focus-visible:border-destructive focus-visible:ring-destructive/30',
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
          {...props}
        />
        {error && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-destructive">
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
