'use client';

import { useEffect, useState } from 'react';
import { logger } from '@/frontend/shared/logger';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    logger.error('Unhandled error', { error: error.message, digest: error.digest });
  }, [error]);

  const handleCopyDigest = () => {
    if (error.digest) {
      navigator.clipboard.writeText(error.digest);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className="relative flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden bg-background p-4 sm:p-6 lg:p-8 text-center select-none"
      dir="rtl"
    >
      {/* Visual Background Lighting & Grid Texture */}
      <div className="pointer-events-none absolute top-0 left-1/2 -z-10 h-96 w-full max-w-7xl -translate-x-1/2 bg-linear-to-b from-destructive/10 via-destructive/5 to-transparent blur-3xl" />
      <div className="pointer-events-none absolute -z-10 h-72 w-72 rounded-full bg-destructive/15 blur-[120px]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-size-[24px_24px] mask-[radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />

      {/* Modern Glassmorphic Container Card */}
      <main
        role="alert"
        aria-live="assertive"
        className="relative z-10 w-full max-w-md rounded-3xl border border-border/50 bg-card/70 p-6 sm:p-10 shadow-2xl shadow-black/10 backdrop-blur-2xl ring-1 ring-white/10 transition-all duration-300 dark:ring-white/5"
      >
        {/* Animated System Status Pill Tag */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-destructive/20 bg-destructive/10 px-3.5 py-1 text-xs font-semibold text-destructive tracking-wide">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
          </span>
          <span>خطأ في النِّظام</span>
        </div>

        {/* Layered Glowing Alert Icon */}
        <div className="group relative mx-auto mb-6 flex h-20 w-20 sm:h-22 sm:w-22 items-center justify-center rounded-2xl border border-destructive/20 bg-linear-to-b from-destructive/15 to-destructive/5 shadow-inner">
          <div className="absolute -inset-1 rounded-2xl bg-destructive/20 blur-md transition duration-500 group-hover:bg-destructive/30" />
          <svg
            className="relative h-10 w-10 text-destructive transition-transform duration-300 ease-out group-hover:scale-110"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M12 8V12M12 16H12.01M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Content Typography */}
        <h1 className="mb-3 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          حدث خطأ غير مُتوقَّع
        </h1>
        <p className="mx-auto mb-6 max-w-sm text-sm leading-relaxed text-muted-foreground sm:text-base">
          عذرًا، حدث خطأ أثناء تحميل الصَّفحة. يُرجَى المحاولة مرَّة أخرى.
        </p>

        {/* Dynamic Error Digest Reference Badge (Renders when digest exists) */}
        {error.digest && (
          <div className="mb-6 flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/40 px-3.5 py-2.5 text-xs text-muted-foreground dir-ltr">
            <div className="flex items-center gap-2 truncate">
              <span className="font-sans text-[11px] font-semibold uppercase text-muted-foreground/70">
                Ref:
              </span>
              <code className="truncate font-mono font-medium text-foreground">{error.digest}</code>
            </div>
            <button
              type="button"
              onClick={handleCopyDigest}
              className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
              title="نسخ مُعرِّف الخطأ"
              aria-label="نسخ مُعرِّف الخطأ"
            >
              {copied ? (
                <svg
                  className="h-3.5 w-3.5 text-emerald-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              )}
            </button>
          </div>
        )}

        {/* Action Controls Group */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
          <button
            onClick={reset}
            className="group relative inline-flex min-h-11 w-full sm:flex-1 items-center justify-center gap-2.5 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background cursor-pointer"
          >
            <svg
              className="h-4 w-4 transition-transform duration-500 ease-out group-hover:rotate-180"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>إعادة المحاولة</span>
          </button>

          <a
            href="/"
            className="inline-flex min-h-11 w-full sm:flex-1 items-center justify-center gap-2 rounded-xl border border-border/70 bg-background/50 px-6 py-3 text-sm font-semibold text-foreground backdrop-blur-md transition-all duration-200 hover:bg-muted hover:border-border active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer"
          >
            <span>الرَّئيسيَّة</span>
          </a>
        </div>
      </main>
    </div>
  );
}
