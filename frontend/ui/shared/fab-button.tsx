'use client';

import { cn } from '@/frontend/shared/cn';

/**
 * Floating action button sharing the exact look of the community "new post" FAB
 * (`compose-fab-btn` in global.css). Used by product dashboards to expose their
 * primary create action without cluttering the toolbar.
 */
export function FabButton({
  label,
  className,
  children,
  ...props
}: React.ComponentProps<'button'> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn('compose-fab-btn visible group', className)}
      {...props}
    >
      {children}
    </button>
  );
}
