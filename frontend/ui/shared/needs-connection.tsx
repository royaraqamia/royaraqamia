'use client';

import { CloudOff } from 'lucide-react';
import { Button } from '@/frontend/ui/primitives/button';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';

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
export function NeedsConnection({ message, onRetry, className }: NeedsConnectionProps) {
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
