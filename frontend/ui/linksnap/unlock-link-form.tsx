'use client';

import { useState } from 'react';
import { Lock, LoaderCircle, CircleAlert } from 'lucide-react';
import { unlockLink } from '@/frontend/api/linksnap';
import { ApiError } from '@/frontend/transport/http';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { LINKSNAP_UNLOCK_COPY } from './linksnap-unlock-copy';

/** The status the server answered with, in the sentence both clients draw (#919). */
function unlockMessage(status: number | undefined): string {
  switch (status) {
    case 400:
      return LINKSNAP_UNLOCK_COPY.notProtected;
    case 401:
      return LINKSNAP_UNLOCK_COPY.wrongPassword;
    case 403:
      return LINKSNAP_UNLOCK_COPY.blocked;
    case 404:
      return LINKSNAP_UNLOCK_COPY.notFound;
    case 410:
      return LINKSNAP_UNLOCK_COPY.expired;
    default:
      return LINKSNAP_UNLOCK_COPY.fallback;
  }
}

export function UnlockLinkForm({ code }: { code: string }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError(LINKSNAP_UNLOCK_COPY.emptyPassword);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { originalUrl } = await unlockLink(code, password);
      window.location.href = originalUrl;
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.isNetworkError ? LINKSNAP_UNLOCK_COPY.offline : unlockMessage(err.status));
      } else {
        setError(LINKSNAP_UNLOCK_COPY.badResponse);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-slate-50 p-4 font-sans text-slate-900 antialiased selection:bg-amber-500/20 selection:text-amber-800 sm:p-6 lg:p-8 dark:bg-slate-950 dark:text-slate-100 dark:selection:bg-amber-500/30 dark:selection:text-amber-200"
      dir="rtl"
    >
      <main className="w-full max-w-md">
        <article
          data-visual="unlock-card"
          className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 p-6 shadow-2xl sm:p-8 lg:p-10 dark:border-slate-800/80 dark:bg-slate-900/80"
        >
          <div className="absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-primary/50 to-transparent" />

          <div className="mb-6 flex flex-col items-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 shadow-inner sm:h-22 sm:w-22">
              <Lock className="h-10 w-10" aria-hidden="true" />
            </div>
          </div>

          <div className="text-center">
            <div
              data-visual="unlock-badge"
              className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span>{LINKSNAP_UNLOCK_COPY.badge}</span>
            </div>

            <h1
              data-visual="unlock-title"
              className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white"
            >
              {LINKSNAP_UNLOCK_COPY.title}
            </h1>
            <p
              data-visual="unlock-body"
              className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400"
            >
              {LINKSNAP_UNLOCK_COPY.body}
            </p>
            <p
              data-visual="unlock-code"
              className="mt-2 text-xs font-mono font-bold text-muted-foreground"
              dir="ltr"
            >
              /{code}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="relative">
              <Lock
                aria-hidden="true"
                className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
              />
              <input
                data-visual="unlock-input"
                type="password"
                name="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder={LINKSNAP_UNLOCK_COPY.passwordLabel}
                autoFocus
                autoComplete="current-password"
                aria-label={LINKSNAP_UNLOCK_COPY.passwordLabel}
                aria-invalid={error ? true : undefined}
                className="w-full h-12 pr-11 pl-4 rounded-xl border border-slate-200/80 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-safe dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium p-3"
              >
                <CircleAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </p>
            )}

            <HeroCtaButton
              data-visual="unlock-submit"
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <>
                  <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>{LINKSNAP_UNLOCK_COPY.busy}</span>
                </>
              ) : (
                <span>{LINKSNAP_UNLOCK_COPY.submit}</span>
              )}
            </HeroCtaButton>
          </form>

          <footer className="mt-6 text-center text-xs text-slate-400 dark:text-slate-600">
            <a
              data-visual="unlock-back"
              href="/linksnap"
              className="font-medium hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded"
            >
              {LINKSNAP_UNLOCK_COPY.back}
            </a>
          </footer>
        </article>
      </main>
    </div>
  );
}
