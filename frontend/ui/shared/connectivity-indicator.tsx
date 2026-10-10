'use client';

import { usePWAContext } from '@/frontend/ui/PWAProvider';

/**
 * Base Connectivity state indicator: shows only while offline, so the online
 * experience stays unobstructed. Rendered inside `PWAProvider`.
 */
export function ConnectivityIndicator() {
  const { isOnline } = usePWAContext();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-40 mx-auto w-fit rounded-full border border-amber-500/40 bg-amber-50 px-4 py-1.5 text-xs font-medium text-amber-800 shadow-sm dark:border-amber-500/30 dark:bg-amber-950 dark:text-amber-200"
    >
      غير متصل — تُحفَظ تغييراتك محليًّا
    </div>
  );
}
