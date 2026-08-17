'use client';

import { lazy, Suspense, useEffect, useState } from 'react';

/**
 * Lazy-mount gate for the sonner `<Toaster/>`.
 *
 * Sonner's global store does not replay toasts created before a `<Toaster/>`
 * subscribes, so we only defer the mount for a short idle window (and any
 * user interaction mounts it immediately). This keeps sonner + the custom
 * toaster styles out of the initial hydration bundle — they live in their own
 * chunk that loads only once needed. All `toast()` calls in the app are
 * user-triggered; the idle fallback also covers realtime notification toasts.
 */
const LazyToaster = lazy(() =>
  import('./toaster-core').then((m) => ({ default: m.RoyaToasterCore }))
);

const MOUNT_DELAY_MS = 2500;

export function RoyaToaster() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (mounted) return;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const show = () => {
      window.removeEventListener('pointerdown', show);
      window.removeEventListener('keydown', show);
      if (timeoutId) clearTimeout(timeoutId);
      setMounted(true);
    };
    window.addEventListener('pointerdown', show, { once: true });
    window.addEventListener('keydown', show, { once: true });
    timeoutId = setTimeout(show, MOUNT_DELAY_MS);
    return () => {
      window.removeEventListener('pointerdown', show);
      window.removeEventListener('keydown', show);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [mounted]);

  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <LazyToaster />
    </Suspense>
  );
}
