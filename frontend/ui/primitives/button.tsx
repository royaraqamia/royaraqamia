'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/frontend/shared/cn';

const buttonVariants = cva(
  // Core button styles - High-end Linear/Apple/Vercel aesthetic with physics-based transitions
  "relative inline-flex items-center justify-center whitespace-nowrap rounded-full font-semibold tracking-tight transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] select-none outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 active:scale-[0.98] hover:-translate-y-0.5 active:translate-y-0 disabled:transform-none",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground border border-primary-foreground/15 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_4px_12px_rgba(0,0,0,0.08)] hover:bg-primary/95 hover:shadow-[0_6px_20px_rgba(0,0,0,0.12)] active:shadow-xs dark:border-white/10',
        destructive:
          'bg-destructive text-destructive-foreground border border-destructive-foreground/15 shadow-[0_1px_2px_rgba(0,0,0,0.08)] hover:bg-destructive/90 hover:shadow-destructive/20 hover:shadow-lg active:shadow-xs',
        outline:
          'border border-input/80 bg-background/80 backdrop-blur-md text-foreground shadow-xs hover:bg-accent/80 hover:text-accent-foreground hover:border-input hover:shadow-sm active:bg-accent',
        secondary:
          'bg-secondary/90 text-secondary-foreground border border-secondary/50 shadow-xs hover:bg-secondary hover:shadow-sm hover:border-secondary-foreground/10 active:bg-secondary/80',
        ghost:
          'text-foreground/90 border border-transparent hover:bg-accent/80 hover:text-foreground active:bg-accent/90 hover:translate-y-0',
        link: 'text-primary underline-offset-4 hover:underline hover:text-primary/80 p-0 h-auto font-medium shadow-none hover:translate-y-0 active:scale-100',
        loading:
          'bg-primary/60 text-primary-foreground/80 border border-primary/10 cursor-wait pointer-events-none shadow-none hover:translate-y-0 active:scale-100',
      },
      size: {
        default: 'h-12 px-6 py-3 text-base font-semibold gap-2.5',
        sm: 'h-10 px-4 py-2 text-sm font-medium gap-2',
        lg: 'h-14 px-8 py-3.5 text-base font-semibold gap-3',
        xl: 'h-16 px-10 py-4 text-lg font-semibold gap-3.5',
        icon: 'size-12 p-0 justify-center',
        'icon-sm': 'size-10 p-0 justify-center',
        'icon-lg': 'size-14 p-0 justify-center',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  isLoading = false,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      aria-busy={isLoading || undefined}
      aria-disabled={isLoading || disabled || undefined}
      disabled={isLoading || disabled}
      className={cn(buttonVariants({ variant: isLoading ? 'loading' : variant, size }), className)}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {isLoading && (
            <svg
              className="animate-spin size-4 shrink-0 opacity-80"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          )}
          {children}
        </>
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
