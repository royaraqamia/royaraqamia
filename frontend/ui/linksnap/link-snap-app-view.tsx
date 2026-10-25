'use client';

import { useState, useEffect, useRef } from 'react';
import { m } from 'motion/react';
import { UrlShortener } from '@/frontend/ui/linksnap/url-shortener';
import { RedirectErrorBanner } from '@/frontend/ui/linksnap/redirect-error-banner';
import { LinksnapSyncStatus } from '@/frontend/ui/linksnap/linksnap-sync-status';
import { useSession } from '@/frontend/state/session-provider';
import { useLocalIdentity } from '@/frontend/state/use-local-identity';
import { LinksnapProvider } from '@/frontend/state/linksnap/linksnap-context';

interface RedirectError {
  type: string;
  code?: string;
}

/**
 * The LinkSnap root (#449, #493).
 *
 * The store's partition comes from {@link useLocalIdentity}, not from
 * `session?.user`: deriving it from the session paints `linksnap__guest` first
 * and reopens on `user:<id>` when the session lands — a guest row flash and a
 * reopen under the reader, the same bug the Quran reader had. The session is
 * still the source of the access token, which is what the shortener's own
 * write needs.
 */
export function LinkSnapAppView() {
  const { session } = useSession();
  const { identity } = useLocalIdentity();
  const [redirectError, setRedirectError] = useState<RedirectError | null>(null);
  const token = session?.access_token ?? null;

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
    <LinksnapProvider identity={identity}>
      <div className="relative flex flex-col min-h-full overflow-hidden">
        <div className="flex justify-end mb-2">
          <LinksnapSyncStatus />
        </div>
        <div className="flex-1 flex flex-col justify-center max-w-xl w-full mx-auto space-y-8">
          <RedirectErrorBanner error={redirectError} onDismiss={() => setRedirectError(null)} />

          <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
            <UrlShortener token={token} />
          </m.div>
        </div>
      </div>
    </LinksnapProvider>
  );
}
