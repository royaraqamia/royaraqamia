'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

/**
 * Root-layout floats mounted off the critical path.
 *
 * Each float is a `next/dynamic` chunk with `ssr: false`, and the whole group
 * only mounts after the first pass of React's commit phase (`setTimeout 0`).
 * Result: their JS is neither in the initial bundle nor requested during
 * hydration — nothing visible is delayed, because all three components render
 * `null` until user scroll / a 1s timer / a detected update anyway, so there
 * is zero layout shift.
 */
const GoUpButton = dynamic(() => import('./GoUpButton').then((m) => m.GoUpButton), {
  ssr: false,
  loading: () => null,
});

const WhatsAppFloat = dynamic(() => import('./WhatsAppFloat').then((m) => m.WhatsAppFloat), {
  ssr: false,
  loading: () => null,
});

const VersionChecker = dynamic(() => import('./VersionChecker').then((m) => m.VersionChecker), {
  ssr: false,
  loading: () => null,
});

export function FloatingActions() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(id);
  }, []);

  if (!mounted) return null;

  return (
    <>
      <VersionChecker />
      <GoUpButton />
      <WhatsAppFloat />
    </>
  );
}
