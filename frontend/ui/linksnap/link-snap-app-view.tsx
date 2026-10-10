'use client';

import { useState, useEffect, useRef } from 'react';
import { m } from 'motion/react';
import { UrlShortener } from '@/frontend/ui/linksnap/url-shortener';
import { RedirectErrorBanner } from '@/frontend/ui/linksnap/redirect-error-banner';
import { useSession } from '@/frontend/state/session-provider';

interface RedirectError {
  type: string;
  code?: string;
}

export function LinkSnapAppView() {
  const { session } = useSession();
  const [redirectError, setRedirectError] = useState<RedirectError | null>(null);

  const parsedParams = useRef(false);
  useEffect(() => {
    if (parsedParams.current) return;
    parsedParams.current = true;
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash && hash.includes('access_token')) {
        window.location.replace('/auth/callback' + hash);
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const errorParam = params.get('error');
      const codeParam = params.get('code');

      if (errorParam === 'oauth_failed') {
        const details = params.get('details') || '';
        queueMicrotask(() => {
          setRedirectError({ type: 'oauth_failed', code: details });
        });
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (errorParam && codeParam) {
        queueMicrotask(() => {
          setRedirectError({ type: errorParam, code: codeParam });
        });
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  return (
    <div className="relative flex flex-col min-h-full overflow-hidden">
      <div className="flex-1 flex flex-col justify-center max-w-xl w-full mx-auto space-y-8">
        <RedirectErrorBanner error={redirectError} onDismiss={() => setRedirectError(null)} />

        <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
          <UrlShortener token={session?.access_token ?? null} />
        </m.div>
      </div>
    </div>
  );
}
