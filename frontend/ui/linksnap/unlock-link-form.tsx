'use client';

import { useState } from 'react';
import { Lock, LoaderCircle, AlertCircle } from 'lucide-react';
import { unlockLink } from '@/frontend/api/linksnap';

export function UnlockLinkForm({ code }: { code: string }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('أدخل كلمة المرور للمتابعة.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { originalUrl } = await unlockLink(code, password);
      window.location.href = originalUrl;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'تعذر فتح الرابط. حاول مجدداً.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-slate-50 p-4 font-sans text-slate-900 antialiased selection:bg-amber-500/20 selection:text-amber-800 sm:p-6 lg:p-8 dark:bg-slate-950 dark:text-slate-100 dark:selection:bg-amber-500/30 dark:selection:text-amber-200"
      dir="rtl"
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-primary/10 via-slate-50/50 to-slate-50 dark:from-primary/10 dark:via-slate-950 dark:to-slate-950" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -z-10 h-80 w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-linear-to-tr from-primary/20 via-accent/10 to-primary/20 blur-3xl sm:h-120 sm:w-120" />

      <main className="w-full max-w-md">
        <article className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 p-6 shadow-2xl backdrop-blur-xl sm:p-8 lg:p-10 dark:border-slate-800/80 dark:bg-slate-900/80">
          <div className="absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-primary/50 to-transparent" />

          <div className="mb-6 flex flex-col items-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 shadow-inner sm:h-22 sm:w-22">
              <Lock className="h-10 w-10" aria-hidden="true" />
            </div>
          </div>

          <div className="text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              <span>رابط محمي بكلمة مرور</span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              فتح الرابط
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              هذا الرابط محمي بكلمة مرور. أدخلها للمتابعة إلى الوجهة.
            </p>
            <p className="mt-2 text-xs font-mono font-bold text-muted-foreground" dir="ltr">
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
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder="كلمة المرور"
                autoFocus
                autoComplete="current-password"
                aria-label="كلمة المرور"
                aria-invalid={error ? true : undefined}
                className="w-full h-12 pr-11 pl-4 rounded-xl border border-slate-200/80 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium p-3"
              >
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 cursor-pointer"
            >
              {loading ? (
                <>
                  <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>جاري الفتح...</span>
                </>
              ) : (
                <span>فتح الرابط</span>
              )}
            </button>
          </form>

          <footer className="mt-6 text-center text-xs text-slate-400 dark:text-slate-600">
            <a
              href="/linksnap"
              className="font-medium hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded"
            >
              العودة إلى LinkSnap
            </a>
          </footer>
        </article>
      </main>
    </div>
  );
}
