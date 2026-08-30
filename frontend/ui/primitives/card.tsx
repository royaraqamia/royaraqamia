import * as React from 'react';

import { cn } from '@/frontend/shared/cn';

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'group/card relative flex flex-col w-full min-w-0 rounded-2xl border border-border/60 bg-card/95 text-card-foreground overflow-hidden backdrop-blur-md',
        'shadow-xs shadow-foreground/5 dark:shadow-none',
        'hover:shadow-xl hover:shadow-foreground/5 hover:border-border/80 hover:-translate-y-1',
        'active:scale-[0.995] active:translate-y-0',
        'focus-within:ring-2 focus-within:ring-ring/20 focus-within:ring-offset-2 focus-within:ring-offset-background',
        'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-5 pt-5 pb-4 sm:px-6 sm:pt-6 sm:pb-5 min-w-0',
        'has-data-[slot=card-action]:grid-cols-[1fr_auto]',
        'border-b border-border/40 [.border-b]:pb-5 sm:[.border-b]:pb-6',
        className
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <h4
      data-slot="card-title"
      className={cn(
        'text-base sm:text-lg lg:text-xl font-bold tracking-tight text-card-foreground leading-snug wrap-break-word min-w-0 transition-colors',
        className
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <p
      data-slot="card-description"
      className={cn(
        'text-xs sm:text-sm text-muted-foreground/90 leading-relaxed font-normal tracking-normal wrap-break-word min-w-0',
        className
      )}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        'col-start-2 row-span-2 row-start-1 self-start justify-self-end flex items-center shrink-0 ml-3 gap-2',
        className
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn(
        'px-5 sm:px-6 py-5 sm:py-6 text-sm text-card-foreground/90 flex-1 min-w-0',
        'first:pt-5 sm:first:pt-6 last:pb-5 sm:last:pb-6',
        className
      )}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'flex items-center justify-between gap-3 px-5 sm:px-6 py-4 sm:py-5 mt-auto min-w-0 border-t border-border/40 bg-muted/20 [.border-t]:pt-4 sm:[.border-t]:pt-5',
        className
      )}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
