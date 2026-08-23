'use client';

import { useEffect, useState } from 'react';
import { RedirectErrorBanner } from '@/frontend/ui/linksnap/redirect-error-banner';

// Error kinds emitted by the redirect controller
// (backend/controllers/linksnap.ts redirects failed short links here with
// ?error=<kind>&code=<code>).
const REDIRECT_ERROR_TYPES = ['blocked', 'expired', 'not-found'] as const;

type RedirectErrorType = (typeof REDIRECT_ERROR_TYPES)[number];

interface RedirectError {
  type: RedirectErrorType;
  code: string;
}

function readRedirectError(): RedirectError | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  const code = params.get('code');
  if (!error || !code) return null;
  if (!(REDIRECT_ERROR_TYPES as readonly string[]).includes(error)) return null;
  return { type: error as RedirectErrorType, code };
}

export function RedirectErrorNotice() {
  const [redirectError, setRedirectError] = useState<RedirectError | null>(null);

  useEffect(() => {
    const found = readRedirectError();
    if (!found) return;
    setRedirectError(found);
    // Strip the query so refreshing (or sharing) the page stays clean.
    window.history.replaceState({}, document.title, window.location.pathname);
  }, []);

  if (!redirectError) return null;

  return (
    <div className="w-full max-w-xl mx-auto px-4 pt-4">
      <RedirectErrorBanner error={redirectError} onDismiss={() => setRedirectError(null)} />
    </div>
  );
}
