import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  // Core button styles - improved typography and visual hierarchy
  "inline-flex items-center justify-center whitespace-nowrap rounded-full font-semibold transition-all duration-300 ease-out disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm hover:shadow-md',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm hover:shadow-md',
        outline:
          'border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground shadow-sm hover:shadow-md',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm hover:shadow-md',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline p-0 h-auto',
        loading: 'bg-primary/50 text-white cursor-wait',
      },
      size: {
        default: 'h-12 px-6 py-3 text-base font-semibold gap-2',
        sm: 'h-10 px-5 text-sm font-medium gap-2',
        lg: 'h-14 px-8 text-base font-semibold gap-3',
        xl: 'h-16 px-10 py-4 text-lg font-semibold gap-3',
        icon: 'size-12 p-0',
        'icon-sm': 'size-10 p-0',
        'icon-lg': 'size-14 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  isLoading = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    isLoading?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      className={cn(
        buttonVariants({ variant: isLoading ? 'loading' : variant, size }),
        // Premium micro-interaction base styles
        'transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        'active:scale-95',
        'hover:-translate-y-1',
        'shadow-sm hover:shadow-md',
        // Enhanced focus states with better accessibility
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:transform-none disabled:shadow-none',
        className
      )}
      disabled={isLoading || props.disabled}
      {...props}
    />
  );
}

export { Button, buttonVariants };
