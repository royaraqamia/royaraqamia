import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/frontend/shared/cn';

const alertVariants = cva(
  'group/alert relative w-full min-w-0 rounded-xl border p-4 text-sm transition-all duration-200 ease-out grid grid-cols-[0_1fr] has-[>svg]:grid-cols-[auto_1fr] gap-y-1 has-[>svg]:gap-x-3.5 items-start [&>svg]:shrink-0 [&>svg]:size-4.5 [&>svg]:translate-y-0.5 [&>svg]:text-current [&>svg]:transition-transform [&>svg]:duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  {
    variants: {
      variant: {
        default:
          'bg-card/95 backdrop-blur-md text-card-foreground border-border/70 shadow-xs shadow-black/[0.03] dark:shadow-none hover:border-border/90',
        destructive:
          'bg-destructive/10 text-destructive border-destructive/25 dark:bg-destructive/15 dark:border-destructive/35 [&>svg]:text-destructive *:data-[slot=alert-description]:text-destructive/85 shadow-xs shadow-destructive/5',
        info: 'bg-sky-500/10 text-sky-950 dark:text-sky-200 border-sky-500/25 dark:bg-sky-500/15 dark:border-sky-500/35 [&>svg]:text-sky-600 dark:[&>svg]:text-sky-400 *:data-[slot=alert-description]:text-sky-800/90 dark:*:data-[slot=alert-description]:text-sky-300/80 shadow-xs shadow-sky-500/5',
        success:
          'bg-emerald-500/10 text-emerald-950 dark:text-emerald-200 border-emerald-500/25 dark:bg-emerald-500/15 dark:border-emerald-500/35 [&>svg]:text-emerald-600 dark:[&>svg]:text-emerald-400 *:data-[slot=alert-description]:text-emerald-800/90 dark:*:data-[slot=alert-description]:text-emerald-300/80 shadow-xs shadow-emerald-500/5',
        warning:
          'bg-amber-500/10 text-amber-950 dark:text-amber-200 border-amber-500/25 dark:bg-amber-500/15 dark:border-amber-500/35 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400 *:data-[slot=alert-description]:text-amber-800/90 dark:*:data-[slot=alert-description]:text-amber-300/80 shadow-xs shadow-amber-500/5',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        'col-start-2 min-w-0 font-bold leading-snug tracking-tight text-foreground/95 wrap-break-word',
        className
      )}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        'col-start-2 min-w-0 text-muted-foreground/90 grid justify-items-start gap-1 text-sm leading-relaxed wrap-break-word [&_p]:leading-relaxed',
        className
      )}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
