'use client';

import * as React from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';

import { cn } from '@/frontend/shared/cn';

function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn('relative overflow-hidden', className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className={cn(
          'size-full rounded-[inherit] scroll-smooth overscroll-contain outline-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'transition-shadow duration-200 ease-out'
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner data-slot="scroll-area-corner" className="bg-transparent" />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        'flex touch-none select-none p-0.5 transition-all duration-300 ease-out',
        'data-[state=visible]:opacity-100 data-[state=hidden]:opacity-0',
        'data-[state=visible]:pointer-events-auto data-[state=hidden]:pointer-events-none',
        'hover:bg-neutral-500/10 dark:hover:bg-white/10 rounded-full',
        orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent hover:w-3',
        orientation === 'horizontal' &&
          'h-2.5 w-full flex-col border-t border-t-transparent hover:h-3',
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className={cn(
          'relative flex-1 rounded-full transition-colors duration-200 ease-out',
          'bg-neutral-400/50 hover:bg-neutral-500/80 active:bg-neutral-600',
          'dark:bg-neutral-600/50 dark:hover:bg-neutral-400/80 dark:active:bg-neutral-300',
          'before:absolute before:left-1/2 before:top-1/2 before:h-full before:min-h-11 before:w-full before:min-w-11 before:-translate-x-1/2 before:-translate-y-1/2'
        )}
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

export { ScrollArea, ScrollBar };
