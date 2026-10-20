'use client';

import { CloudOff } from 'lucide-react';
import { Button } from '@/frontend/ui/primitives/button';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { cn } from '@/frontend/shared/cn';

interface NeedsConnectionProps {
  /**
   * What the surface could not do, in the surface's own words. The title says
   * *why* — there is no path to the server; this says which part of the page is
   * affected, because "no appointments are open" and "we could not ask" are
   * different statements and only one of them can be made from a failed request.
   */
  message: string;
  /** Runs the surface's own load again. Omitted where there is nothing to retry. */
  onRetry?: () => void;
  className?: string;
  /**
   * `block` is the state of a whole page or panel. `inline` is the same
   * statement at the point of a failed action — inside a form or under a picker
   * — where an empty-state block would drown the control it belongs to. Both
   * carry the same title and vocabulary; only the density changes.
   */
  variant?: 'block' | 'inline';
}

/**
 * The one needs-connection block for a server-owned surface (ADR-0031).
 *
 * It exists so an online-only surface can never answer a failed request with the
 * empty state it shows for real absence. A calendar with no rows and an
 * unreachable server look identical to a component that only knows `length`, and
 * the difference is the whole point of the ADR: the first is information, the
 * second is a silent failure wearing information's clothes.
 *
 * The presentation is shared (ADR-0027: the sync-status UI is one vocabulary);
 * the copy is the caller's, because each surface knows what it lost.
 */
export function NeedsConnection({
  message,
  onRetry,
  className,
  variant = 'block',
}: NeedsConnectionProps) {
  if (variant === 'inline') {
    return (
      <div
        role="status"
        className={cn(
          'flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-50 p-3.5 text-amber-900 shadow-xs dark:border-amber-500/30 dark:bg-amber-950/60 dark:text-amber-200',
          className
        )}
      >
        <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-bold leading-snug">يتطلَّب الاتصال بالإنترنت</p>
          <p className="text-xs leading-relaxed sm:text-sm">{message}</p>
          {onRetry && (
            <Button type="button" variant="outline" size="sm" onClick={onRetry} className="mt-1.5">
              إعادة المحاولة
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <EmptyState
      icon={CloudOff}
      title="يتطلَّب الاتصال بالإنترنت"
      description={message}
      className={className}
      action={
        onRetry ? (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            إعادة المحاولة
          </Button>
        ) : undefined
      }
    />
  );
}
