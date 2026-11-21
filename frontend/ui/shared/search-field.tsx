import * as React from 'react';

import { cn } from '@/frontend/shared/cn';

/**
 * The search input, shared by every product's search box (issue #1648).
 *
 * The hint colour is the one thing this component must own: it reads the
 * `placeholder` token through `--color-placeholder`, so a search field added
 * later inherits a hint that clears AA instead of copying an alpha that does
 * not. The icon and clear button stay with the surface that owns their state;
 * only the input and its class string are shared.
 */
const SearchField = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type = 'text', autoComplete = 'off', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      autoComplete={autoComplete}
      data-slot="search-field"
      className={cn(
        'h-11 w-full rounded-xl border border-border/50 bg-background/60 ps-10 pe-10 text-sm outline-none transition-safe placeholder:text-placeholder focus:border-primary/50 focus:ring-2 focus:ring-primary/20',
        className
      )}
      {...props}
    />
  )
);
SearchField.displayName = 'SearchField';

export { SearchField };
