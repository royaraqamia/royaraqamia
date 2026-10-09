'use client';

import { useEffect, useRef, useState } from 'react';
import { checkUsernameAvailability } from '@/frontend/api/me';
import { UsernameSchema } from '@/shared/contracts/users';

export type UsernameAvailabilityStatus = 'idle' | 'invalid' | 'checking' | 'available' | 'taken';

const DEBOUNCE_MS = 400;

/**
 * Debounced live availability check for the public handle. Short prefixes and the
 * member's own current handle short-circuit before the round-trip, and format
 * errors are reported locally so the endpoint is only hit for plausible handles.
 */
export function useUsernameAvailability(value: string, currentUsername: string | null) {
  const [status, setStatus] = useState<UsernameAvailabilityStatus>('idle');
  const [error, setError] = useState<string | undefined>(undefined);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = value.trim();

    if (trimmed.length < 3) {
      setStatus('idle');
      setError(undefined);
      return;
    }

    const parsed = UsernameSchema.safeParse(value);
    if (!parsed.success) {
      setStatus('invalid');
      setError(parsed.error.issues[0]?.message ?? 'معرّف غير صالح');
      return;
    }

    if (currentUsername && parsed.data === currentUsername.toLowerCase()) {
      setStatus('idle');
      setError(undefined);
      return;
    }

    setStatus('checking');
    setError(undefined);
    const id = ++requestIdRef.current;

    const timer = setTimeout(async () => {
      try {
        const result = await checkUsernameAvailability(parsed.data);
        if (requestIdRef.current !== id) return;
        setStatus(result.available ? 'available' : 'taken');
        setError(result.available ? undefined : (result.error ?? 'المعرّف مستخدم بالفعل'));
      } catch {
        if (requestIdRef.current !== id) return;
        setStatus('idle');
        setError(undefined);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value, currentUsername]);

  return { status, error };
}
