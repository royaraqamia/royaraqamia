import * as React from 'react';

import { cn } from './utils';

interface InputProps extends React.ComponentProps<'input'> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
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
          // Focus states - improved accessibility
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:border-ring',
          // Disabled states
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/50',
          // File input styles
          'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground file:mr-3',
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
        {...props}
      />
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
