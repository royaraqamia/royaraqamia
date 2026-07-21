import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      // Enhanced base styles with premium sizing and transitions
      'peer h-5 w-5 shrink-0 rounded-md border border-input bg-background',
      'ring-offset-background transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
      // Premium focus states
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2',
      'focus-visible:border-ring',
      // Hover states
      'hover:border-primary/30 hover:bg-primary/5',
      // Disabled states
      'disabled:cursor-not-allowed disabled:opacity-50',
      // Checked states with premium animation
      'data-[state=checked]:bg-primary data-[state=checked]:border-primary',
      'data-[state=checked]:hover:bg-primary/90',
      // Indeterminate states
      'data-[state=indeterminate]:bg-primary data-[state=indeterminate]:border-primary',
      'data-[state=indeterminate]:hover:bg-primary/90',
      // Shadow and depth
      'shadow-sm',
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn(
        'flex items-center justify-center text-primary-foreground',
        'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        'data-[state=checked]:scale-100',
        'data-[state=indeterminate]:scale-100'
      )}
    >
      <Check className="h-3.5 w-3.5 stroke-[2.5px]" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
