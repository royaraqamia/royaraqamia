'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { XIcon } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal(props: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    data-slot="dialog-overlay"
    className={cn(
      // Near-opaque overlay: a full-viewport backdrop-filter re-rasterizes the
      // entire screen every frame during its fade transition.
      'fixed inset-0 z-10000 bg-black/70 transition-opacity duration-300 ease-out',
      'data-[state=open]:animate-in data-[state=open]:fade-in-0',
      'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      data-slot="dialog-content"
      className={cn(
        'fixed z-10000 grid w-[calc(100%-2rem)] gap-5 p-6 text-foreground shadow-2xl duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        'border border-border/60 bg-background/95',
        'rounded-3xl sm:rounded-2xl',
        'max-h-[calc(100dvh-3rem)] overflow-y-auto dialog-scrollbar',
        // Mobile-first positioning: Floating card on mobile -> Perfectly centered dialog on desktop
        'bottom-4 left-1/2 -translate-x-1/2 translate-y-0 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg',
        // Entrance & Exit Motion Animations
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        'max-sm:data-[state=open]:slide-in-from-bottom-6 max-sm:data-[state=closed]:slide-out-to-bottom-6',
        'sm:data-[state=open]:slide-in-from-top-[48%]',
        'sm:data-[state=closed]:slide-out-to-top-[48%]',
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        className="absolute top-4 right-4 rounded-full p-2 text-muted-foreground/80 opacity-80 ring-offset-background transition-[color,background-color,opacity,transform] duration-200 hover:bg-accent/80 hover:text-foreground hover:opacity-100 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
        aria-label="إغلاق"
      >
        <XIcon className="size-4" />
        <span className="sr-only">إغلاق</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col space-y-1.5 text-center sm:text-left pr-8', className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 pt-2',
        className
      )}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      id="dialog-title"
      data-slot="dialog-title"
      className={cn('text-xl font-semibold leading-none tracking-tight text-foreground', className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm leading-relaxed text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogClose,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
