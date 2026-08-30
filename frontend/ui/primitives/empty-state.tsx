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
        'group relative flex flex-col items-center justify-center text-center transition-all duration-300 ease-out',
        isCard
          ? 'rounded-3xl border border-border/60 bg-linear-to-b from-card/90 via-card/60 to-card/30 p-6 sm:p-10 md:p-12 shadow-xs backdrop-blur-xl hover:border-border/80 hover:shadow-2xl hover:shadow-primary/5 ring-1 ring-foreground/5'
          : 'w-full max-w-md mx-auto py-12 sm:py-16 md:py-20 px-4 sm:px-6',
        className
      )}
    >
      {/* Dynamic ambient radial hover glow */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100"
        aria-hidden="true"
      >
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 size-48 rounded-full bg-primary/10 blur-3xl" />
      </div>

      {/* Floating Glassmorphic Icon Badge Container */}
      <div className="relative mb-5 sm:mb-6 flex items-center justify-center">
        {/* Soft radial background aura */}
        <div
          className="absolute -inset-2 rounded-2xl bg-linear-to-tr from-primary/20 via-primary/10 to-transparent blur-md opacity-70 transition-all duration-500 ease-out group-hover:scale-110 group-hover:opacity-100"
          aria-hidden="true"
        />

        {/* Icon Container Badge */}
        <div className="relative flex size-14 sm:size-16 items-center justify-center rounded-2xl border border-primary/20 bg-background/80 p-3.5 shadow-xs backdrop-blur-md transition-all duration-300 ease-out group-hover:scale-105 group-hover:border-primary/35 group-hover:bg-background">
          <Icon
            className="size-6 sm:size-7 text-primary transition-transform duration-300 ease-out group-hover:scale-110"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Title */}
      <h3 className="text-base sm:text-lg md:text-xl font-bold tracking-tight text-foreground transition-colors duration-200 wrap-break-word max-w-full">
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p className="mt-2 text-xs sm:text-sm text-muted-foreground/90 max-w-xs sm:max-w-sm leading-relaxed text-balance wrap-break-word font-normal">
          {description}
        </p>
      )}

      {/* Action Element Container */}
      {action && (
        <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-xs sm:max-w-none transition-all duration-300">
          {action}
        </div>
      )}
    </div>
  );
}
