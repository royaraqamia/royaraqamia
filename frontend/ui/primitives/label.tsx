'use client';

import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/frontend/shared/cn';

const labelVariants = cva(
  'inline-flex items-baseline gap-1.5 text-sm font-medium leading-none tracking-tight select-none transition-colors duration-200 ease-out text-neutral-900 dark:text-neutral-100 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50 group-data-[disabled=true]:cursor-not-allowed group-data-[disabled=true]:opacity-50 peer-invalid:text-red-600 dark:peer-invalid:text-red-400 data-[invalid=true]:text-red-600 dark:data-[invalid=true]:text-red-400 peer-focus-visible:text-neutral-950 dark:peer-focus-visible:text-white',
  {
    variants: {
      variant: {
        default: 'text-neutral-900 dark:text-neutral-100',
        muted: 'text-neutral-500 dark:text-neutral-400',
        subtle: 'text-neutral-700 dark:text-neutral-300',
        error: 'text-red-600 dark:text-red-400 font-bold',
        success: 'text-emerald-600 dark:text-emerald-400',
      },
      size: {
        xs: 'text-[11px] leading-3 gap-1',
        sm: 'text-xs leading-4 gap-1',
        default: 'text-sm leading-none gap-1.5',
        lg: 'text-base leading-6 gap-2',
      },
      weight: {
        normal: 'font-normal',
        medium: 'font-medium',
        semibold: 'font-bold',
        bold: 'font-bold',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      weight: 'medium',
    },
  }
);

export interface LabelProps
  extends
    React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>,
    VariantProps<typeof labelVariants> {
  required?: boolean;
  optional?: boolean;
}

const Label = React.forwardRef<React.ElementRef<typeof LabelPrimitive.Root>, LabelProps>(
  ({ className, variant, size, weight, required, optional, children, ...props }, ref) => (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(labelVariants({ variant, size, weight }), className)}
      {...props}
    >
      {children}
      {required && (
        <span
          aria-hidden="true"
          className="ml-0.5 text-xs font-bold text-red-500 select-none dark:text-red-400"
          title="Required field"
        >
          *
        </span>
      )}
      {!required && optional && (
        <span className="ml-1 text-xs font-normal text-neutral-400 select-none dark:text-neutral-500">
          (optional)
        </span>
      )}
    </LabelPrimitive.Root>
  )
);
Label.displayName = LabelPrimitive.Root.displayName;

export { Label, labelVariants };
