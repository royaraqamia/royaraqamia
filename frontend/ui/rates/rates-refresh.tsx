'use client';

import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/frontend/ui/primitives/button';
import { usePWAContext } from '@/frontend/ui/PWAProvider';

/**
 * The Rates board is a snapshot fetched from live feeds (ADR-0031): it is
 * readable offline but never *refreshed* there. The refresh affordance is
 * therefore disabled with no network, and the last snapshot stays read-only.
 */
export function RatesRefresh() {
  const router = useRouter();
  const { isOnline } = usePWAContext();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => router.refresh()}
      disabled={!isOnline}
      aria-label={isOnline ? 'تحديث الأسعار' : 'تحديث الأسعار يحتاج اتصالًا بالإنترنت'}
      title={isOnline ? undefined : 'يحتاج اتصالًا بالإنترنت'}
    >
      <RefreshCw className="size-4" aria-hidden="true" />
      تحديث
    </Button>
  );
}
