'use client';

import { useCallback, useState } from 'react';
import { shorten, type ShortenedLink } from '@/frontend/api/linksnap';
import { useLinksnapContext } from '@/frontend/state/linksnap/linksnap-context';

export type { ShortenedLink } from '@/frontend/api/linksnap';

/**
 * Creates a short link. A signed-in user writes to the Local Store + Outbox so
 * the link is created offline and synced later (ADR-0029); a guest (whose link
 * is only meaningful on the server) still calls the network directly and shows
 * a needs-connection state when it is unavailable.
 */
export function useShortenLink(token: string | null) {
  const context = useLinksnapContext();
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
        if (context && context.isSignedIn) {
          return await context.createLink({
            originalUrl,
            customCode: customCode || undefined,
            password: password || undefined,
          });
        }
        return await shorten(originalUrl, customCode, token, password);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'حدث خطأ أثناء اختصار الرَّابط.');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [context, token]
  );

  return { shorten: shortenAction, loading, error, setError };
}
