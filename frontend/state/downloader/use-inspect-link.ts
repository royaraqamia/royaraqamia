'use client';

import { useEffect, useState } from 'react';
import { isPublicHttpUrl, type ProbeResult } from '@/shared/contracts/downloader';
import { inspectDownloadLink } from '@/frontend/api/downloader';

const DEBOUNCE_MS = 600;

const UNKNOWN_MESSAGE = 'تعذّر فحص الرابط. تأكّد من صحّته وحاول مجددًا.';

/**
 * Inspects a link after the visitor stops typing, so the format field can adapt
 * to what the link actually is. A stale response never wins: the effect cancels
 * on every URL change. An invalid/empty URL clears the result.
 */
export function useInspectDownloadLink(url: string) {
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = url.trim();
    if (!isPublicHttpUrl(trimmed)) {
      setResult(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(() => {
      void inspectDownloadLink(trimmed)
        .then((next) => {
          if (cancelled) return;
          setResult(next);
          setLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          setResult({ status: 'unknown', message: UNKNOWN_MESSAGE });
          setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [url]);

  return { result, loading };
}
