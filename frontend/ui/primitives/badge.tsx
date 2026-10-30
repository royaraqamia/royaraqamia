import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/frontend/shared/cn';

const badgeVariants = cva(
  'roy-badge transition-safe duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 hover:shadow-sm active:bg-primary/95',
        secondary: 'roy-badge--neutral hover:bg-secondary hover:text-foreground',
        destructive:
          'border-destructive/30 bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive-foreground hover:bg-destructive/20 hover:border-destructive/40 dark:hover:bg-destructive/30',
        outline:
          'border-border/80 bg-background/50 text-foreground hover:bg-accent/80 hover:text-accent-foreground hover:border-border/100 dark:bg-background/20',
        success: 'roy-badge--success',
        warning:
          'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/40',
        info: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400 hover:bg-sky-500/20 hover:border-sky-500/40',
        glow: 'border-primary/30 bg-primary/10 text-primary shadow-xs shadow-primary/10 hover:bg-primary/20 hover:border-primary/40',
      },
      size: {
        sm: 'roy-badge--sm',
        default: 'roy-badge--default',
        lg: 'roy-badge--lg',
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
