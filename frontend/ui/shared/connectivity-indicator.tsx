'use client';

import { usePWAContext } from '@/frontend/ui/PWAProvider';
import { useContentFreshness } from '@/frontend/shared/use-content-freshness';

/**
 * Base Connectivity state indicator: shows only while offline, so the online
 * experience stays unobstructed. Rendered inside `PWAProvider`. When the route
 * has a remembered freshness it also reports how old the cached copy is, so a
 * visitor can tell stale content from fresh.
 */
export function ConnectivityIndicator() {
  const { isOnline } = usePWAContext();
  const { label } = useContentFreshness(isOnline);

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="connectivity-indicator pointer-events-none fixed inset-x-0 z-40 mx-auto w-fit rounded-full border border-amber-500/40 bg-amber-50 px-4 py-1.5 text-xs font-medium text-amber-800 shadow-sm dark:border-amber-500/30 dark:bg-amber-950 dark:text-amber-200"
    >
      غير متَّصل — تُحفَظ تغييراتك محليًّا
      {label ? <span className="ms-1.5 opacity-90">· نسخة محفوظة {label}</span> : null}
    </div>
  );
}
