'use client';

import { useEffect, useRef, useState } from 'react';
import { checkCodeAvailability } from '@/frontend/api/linksnap';

export type SlugAvailabilityStatus = 'idle' | 'checking' | 'available' | 'taken';

const DEBOUNCE_MS = 400;

/**
 * Debounced live availability check for a short-link slug. Only fires when the
 * slug is 3+ characters after sanitization so we don't spam the endpoint while
 * the user is still typing a prefix.
 */
export function useSlugAvailability(value: string, token: string | null, exemptCode?: string) {
  const [status, setStatus] = useState<SlugAvailabilityStatus>('idle');
  const [error, setError] = useState<string | undefined>(undefined);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const slug = value.trim().replace(/[^a-zA-Z0-9_-]/g, '');

    if (exemptCode && slug === exemptCode) {
      setStatus('available');
      setError(undefined);
      return;
    }

    if (!token || slug.length < 3) {
      setStatus('idle');
      setError(undefined);
      return;
    }

    setStatus('checking');
    const id = ++requestIdRef.current;

    const timer = setTimeout(async () => {
      try {
        const result = await checkCodeAvailability(slug, token);
        if (requestIdRef.current !== id) return;
        setStatus(result.available ? 'available' : 'taken');
        setError(result.error);
      } catch {
        if (requestIdRef.current !== id) return;
        setStatus('idle');
        setError(undefined);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value, token, exemptCode]);

  return { status, error };
}
