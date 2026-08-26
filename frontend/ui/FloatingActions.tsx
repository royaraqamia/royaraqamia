'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

/**
 * Root-layout floats mounted off the critical path.
 *
 * Each float is a `next/dynamic` chunk with `ssr: false`, and the whole group
 * only mounts after the first pass of React's commit phase (`setTimeout 0`).
 * Nothing visible is delayed and there is zero layout shift: all three
 * components render `null` until user scroll / a 1s timer / a detected
 * update anyway.
 * NOTE (measured, Next 16 / Turbopack): the merged dynamic chunk (which also
 * carries the lazily-imported Supabase browser client) still downloads as a
 * non-blocking <script async> in prerendered HTML; execution stays deferred.
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
