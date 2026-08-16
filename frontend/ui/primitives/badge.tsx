import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/frontend/shared/cn';

const badgeVariants = cva(
  'inline-flex items-center justify-center shrink-0 max-w-full font-semibold select-none rounded-full border text-xs tracking-tight transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 gap-1.5',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 hover:shadow-sm active:bg-primary/95',
        secondary:
          'border-border/60 bg-secondary/80 text-secondary-foreground backdrop-blur-md hover:bg-secondary hover:border-border hover:text-foreground',
        destructive:
          'border-destructive/30 bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive-foreground hover:bg-destructive/20 hover:border-destructive/40 dark:hover:bg-destructive/30',
        outline:
          'border-border/80 bg-background/50 text-foreground backdrop-blur-xs hover:bg-accent/80 hover:text-accent-foreground hover:border-border/100 dark:bg-background/20',
        success:
          'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40',
        warning:
          'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/40',
        info: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400 hover:bg-sky-500/20 hover:border-sky-500/40',
        glow: 'border-primary/30 bg-primary/10 text-primary shadow-xs shadow-primary/10 backdrop-blur-md hover:bg-primary/20 hover:border-primary/40',
      },
      size: {
        sm: 'h-5 px-2 text-[10px] uppercase tracking-wider gap-1 font-bold',
        default: 'h-6 px-2.5 py-0.5 text-xs gap-1.5',
        lg: 'h-8 px-3.5 py-1 text-sm gap-2 font-medium',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, size, ...props }, ref) => {
    return <div ref={ref} className={cn(badgeVariants({ variant, size }), className)} {...props} />;
  }
);

Badge.displayName = 'Badge';

export { Badge, badgeVariants };
