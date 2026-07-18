import React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps {
  className?: string;
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info' | 'outline';
  children: React.ReactNode;
}

export function Badge({ className, variant = 'default', children }: BadgeProps) {
  const variants = {
    default:
      'bg-muted/50 text-muted-foreground border-border dark:bg-card dark:text-muted-foreground dark:border-border',
    success:
      'bg-success/10 text-success border-success/20 dark:bg-success/30 dark:text-success dark:border-success/80',
    danger:
      'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700',
    warning:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700',
    info: 'bg-primary/10 text-primary border-primary/20 dark:bg-primary/30 dark:text-primary dark:border-primary/70',
    outline:
      'bg-transparent text-muted-foreground border-border dark:text-muted-foreground dark:border-border',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
