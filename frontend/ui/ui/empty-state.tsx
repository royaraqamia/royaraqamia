import { type LucideIcon } from 'lucide-react';
import { cn } from '@/frontend/shared/cn';

interface EmptyStateProps {
  icon: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  variant?: 'default' | 'card';
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = 'default',
  className,
}: EmptyStateProps) {
  const isCard = variant === 'card';

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center animate-fade-in',
        isCard ? 'rounded-3xl border border-dashed border-border bg-card p-8 card-lift' : 'py-12',
        className
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
        <Icon className="size-7 text-primary" aria-hidden="true" />
      </div>
      <h3 className="text-base sm:text-lg font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 text-sm text-muted-foreground max-w-xs">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
