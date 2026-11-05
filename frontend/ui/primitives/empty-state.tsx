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
        'group relative flex flex-col items-center justify-center text-center transition-safe duration-300 ease-out',
        isCard
          ? 'rounded-3xl border border-border/60 bg-linear-to-b from-card/90 via-card/60 to-card/30 max-sm:p-6 sm:p-10 md:p-12 shadow-xs hover:border-border/80 hover:shadow-2xl hover:shadow-primary/5 ring-1 ring-foreground/5'
          : 'w-full max-w-md mx-auto max-sm:py-12 sm:py-16 md:py-20 max-sm:px-4 sm:px-6',
        className
      )}
    >
      {/* Dynamic ambient radial hover glow removed (ADR 0004) */}

      {/* Floating Glassmorphic Icon Badge Container */}
      <div className="relative max-sm:mb-5 sm:mb-6 flex items-center justify-center">
        {/* Icon Container Badge */}
        <div className="relative flex max-sm:size-14 sm:size-16 items-center justify-center rounded-2xl border border-primary/20 bg-background/80 p-3.5 shadow-xs transition-safe duration-300 ease-out group-hover:scale-105 group-hover:border-primary/35 group-hover:bg-background">
          <Icon
            className="max-sm:size-6 sm:size-7 text-primary transition-transform duration-300 ease-out group-hover:scale-110"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Title */}
      <h3 className="max-sm:text-base sm:text-lg md:text-xl font-bold tracking-tight text-foreground transition-colors duration-200 wrap-break-word max-w-full">
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p className="mt-2 max-sm:text-xs/[1.625] sm:text-sm/[1.625] text-muted-foreground/90 max-sm:max-w-xs sm:max-w-sm text-balance wrap-break-word font-normal">
          {description}
        </p>
      )}

      {/* Action Element Container */}
      {action && (
        <div className="max-sm:mt-6 sm:mt-8 flex max-sm:flex-col sm:flex-row items-center justify-center gap-3 w-full max-sm:max-w-xs sm:max-w-none transition-safe duration-300">
          {action}
        </div>
      )}
    </div>
  );
}
