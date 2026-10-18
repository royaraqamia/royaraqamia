'use client';

import { lazy, Suspense, useEffect, useState } from 'react';
import { tolerateChunkFailure } from './lazy-chunk';

/**
 * Lazy-mount gate for the sonner `<Toaster/>`.
 *
 * Sonner's global store does not replay toasts created before a `<Toaster/>`
 * subscribes, so we only defer the mount for a short idle window (and any
 * user interaction mounts it immediately). This keeps sonner + the custom
 * toaster styles out of the initial hydration bundle — they live in their own
 * chunk that loads only once needed. All `toast()` calls in the app are
 * user-triggered; the idle fallback also covers realtime notification toasts.
 *
 * The chunk is *fetched* on mount, though, not at the first interaction. This
 * sits in the root layout, so deferring the request means a tap with the radio
 * off asks for a chunk that was never cached. `tolerateChunkFailure` keeps that
 * from costing the page; preloading it while online costs nothing visible.
 */
const loadToasterCore = () => import('./toaster-core');

const loadToasterModule = tolerateChunkFailure('toaster', () =>
  loadToasterCore().then((m) => ({ default: m.RoyaToasterCore }))
);

const LazyToaster = lazy(loadToasterModule);

const MOUNT_DELAY_MS = 2500;

export function RoyaToaster() {
  const [mounted, setMounted] = useState(false);

  // Request the chunk as soon as the app runs, while we are online. The gate
  // below is about the initial bundle, not about when the request may happen.
  useEffect(() => {
    void loadToasterCore().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (mounted) return;
    const show = () => {
      window.removeEventListener('pointerdown', show);
      window.removeEventListener('keydown', show);
      if (timeoutId) clearTimeout(timeoutId);
      setMounted(true);
    };
    window.addEventListener('pointerdown', show, { once: true });
    window.addEventListener('keydown', show, { once: true });
    const timeoutId = setTimeout(show, MOUNT_DELAY_MS);
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
