'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { NeedsConnection } from '@/frontend/ui/shared/needs-connection';
import { readPrefixServe } from '@/frontend/shared/prefix-serve';

/**
 * The inline card for a navigation the service worker could not answer exactly
 * (#490).
 *
 * A never-visited dynamic detail route — `/community/<slug>`, `/quran/<surah>`,
 * `/u/<username>`, `/verify/<code>` — has no document of its own to cache
 * (ADR-0071), so an offline deep link used to be answered with `/offline`: a
 * different screen replacing the one the user asked for. The worker now answers
 * with the nearest cached ancestor shell, which gives the app's own chrome and
 * the URL the user asked for; this card says the part that is missing, at the
 * segment level, instead of the whole page saying it.
 *
 * It is the shared needs-connection state (ADR-0031), not a new failure
 * vocabulary, and it renders nothing at all for a document the worker answered
 * itself — which is every online visit.
 */
export function OfflineRouteCard() {
  const pathname = usePathname();
  const [served, setServed] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setServed(null);
    void readPrefixServe(pathname).then((prefix) => {
      if (active) setServed(prefix);
    });
    return () => {
      active = false;
    };
  }, [pathname]);

  if (!served) return null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-4">
      <NeedsConnection
        variant="inline"
        message="هذا الرابط غير متاح دون اتصال."
        onRetry={() => window.location.reload()}
      />
    </div>
  );
}
