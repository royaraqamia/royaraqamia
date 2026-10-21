'use client';

import { TriangleAlert } from 'lucide-react';
import { ApiError } from '@/frontend/transport/http';
import { Button } from '@/frontend/ui/primitives/button';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { NeedsConnection } from '@/frontend/ui/shared/needs-connection';
import { cn } from '@/frontend/shared/cn';

/**
 * A failed read, with the one fact the presentation needs: whether the request
 * ever reached the server. A request that never left is a connection problem and
 * belongs to `NeedsConnection`; a server that answered with a failure is an
 * ordinary error, and saying "check your connection" for it would be a lie
 * (ADR-0031's three answers kept apart).
 */
export interface ReadFailure {
  offline: boolean;
  /** What the surface could not do, in the surface's own words. */
  message: string;
}

export function toReadFailure(error: unknown, message: string): ReadFailure {
  return { offline: error instanceof ApiError && error.isNetworkError, message };
}

interface ReadFailureNoticeProps {
  failure: ReadFailure;
  /** Runs the surface's own read again. */
  onRetry?: () => void;
  /**
   * `block` replaces a whole page or panel; `inline` sits where a control failed
   * — under a "load more" button, inside a suggestions panel — without pushing
   * the rest of the surface around.
   */
  variant?: 'block' | 'inline';
  className?: string;
}

/**
 * The two failure states of a read, chosen by cause rather than by surface.
 *
 * Callers keep the copy: a neutral "what was lost, try again" sentence reads
 * correctly under both titles, and `NeedsConnection` supplies the connection
 * title itself.
 */
export function ReadFailureNotice({
  failure,
  onRetry,
  variant = 'block',
  className,
}: ReadFailureNoticeProps) {
  if (failure.offline) {
    return (
      <NeedsConnection
        message={failure.message}
        onRetry={onRetry}
        variant={variant}
        className={className}
      />
    );
  }

  const retry = onRetry ? (
    <Button type="button" variant="outline" size="sm" onClick={onRetry}>
      إعادة المحاولة
    </Button>
  ) : undefined;

  if (variant === 'inline') {
    return (
      <div
        role="alert"
        className={cn(
          'flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 text-destructive',
          className
        )}
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-bold leading-snug">لم يكتمل الطَّلب</p>
          <p className="text-xs leading-relaxed sm:text-sm">{failure.message}</p>
          {retry && <div className="mt-1.5">{retry}</div>}
        </div>
      </div>
    );
  }

  return (
    <EmptyState
      icon={TriangleAlert}
      variant="card"
      title="لم يكتمل الطَّلب"
      description={failure.message}
      className={className}
      action={retry}
    />
  );
}
