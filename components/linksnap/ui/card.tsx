import React from 'react';
import { cn } from '@/domains/linksnap/lib/utils';

interface CardProps {
  className?: string;
  children: React.ReactNode;
}

export function Card({ className, children }: CardProps) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-card rounded-2xl border border-border dark:border-border shadow-xl shadow-slate-100/50',
        'transition-shadow duration-200 ease-out-cubic',
        'hover:shadow-lg hover:shadow-slate-100/60 dark:hover:shadow-slate-900/60',
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: CardProps) {
  return (
    <div className={cn('p-6 border-b border-border/50 dark:border-border/50', className)}>
      {children}
    </div>
  );
}

export function CardContent({ className, children }: CardProps) {
  return <div className={cn('p-6', className)}>{children}</div>;
}
