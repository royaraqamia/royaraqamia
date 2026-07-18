import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-full font-bold transition-all disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  {
    variants: {
      variant: {
        default: 'bg-primary text-white hover:bg-primary/90 shadow-sm',
        destructive: 'bg-destructive text-white hover:bg-destructive/90 shadow-sm',
        outline:
          'border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground shadow-sm',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline p-0 h-auto',
        loading: 'bg-primary/50 text-white cursor-wait',
      },
      size: {
        default: 'h-12 px-6 py-3 text-base font-bold gap-2 rounded-full',
        sm: 'h-10 px-4 text-sm font-bold gap-2 rounded-full',
        lg: 'h-14 px-8 text-base font-bold gap-2 rounded-full',
        xl: 'h-16 px-10 py-4 text-lg font-bold gap-3 rounded-full',
        icon: 'size-12 p-0 rounded-full',
        'icon-sm': 'size-10 p-0 rounded-full',
        'icon-lg': 'size-14 p-0 rounded-full',
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
      className={cn(buttonVariants({ variant: isLoading ? 'loading' : variant, size }), className)}
      disabled={isLoading || props.disabled}
      {...props}
    />
  );
}

export { Button, buttonVariants };
