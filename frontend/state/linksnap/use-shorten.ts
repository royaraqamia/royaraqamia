'use client';

import { useCallback, useState } from 'react';
import { shorten, type ShortenedLink } from '@/frontend/api/linksnap';

export type { ShortenedLink } from '@/frontend/api/linksnap';

export function useShortenLink(token: string | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shortenAction = useCallback(
    async (
      originalUrl: string,
      customCode: string,
      password?: string
    ): Promise<ShortenedLink | null> => {
      setLoading(true);
      setError(null);
      try {
        return await shorten(originalUrl, customCode, token, password);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'حدث خطأ أثناء اختصار الرَّابط.');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  return { shorten: shortenAction, loading, error, setError };
}
