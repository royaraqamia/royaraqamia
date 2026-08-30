'use client';

import { useEffect } from 'react';
import { captureClientError } from '@/frontend/shared/sentry';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void captureClientError(error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl" className="h-full dark">
      <body className="h-full bg-zinc-950 font-sans text-zinc-100 antialiased selection:bg-purple-500/30 selection:text-purple-200">
        <main className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden p-4 sm:p-6 lg:p-8">
          {/* Ambient Radial Gradient Glow & Subtle Mesh Grid */}
          <div
            className="pointer-events-none absolute inset-0 -z-10 overflow-hidden select-none"
            aria-hidden="true"
          >
            <div className="absolute top-1/2 left-1/2 h-125 w-125 -translate-x-1/2 -translate-y-1/2 rounded-full bg-linear-to-tr from-purple-600/20 via-violet-600/15 to-pink-500/10 glow-blur-lg opacity-70" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#27272a15_1px,transparent_1px),linear-gradient(to_bottom,#27272a15_1px,transparent_1px)] bg-size-[3rem_3rem] mask-[radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
          </div>

          {/* Elevated Glassmorphic Container Card */}
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-6 sm:p-10 text-center backdrop-blur-2xl shadow-2xl shadow-black/80 ring-1 ring-white/10">
            {/* Top Edge Gradient Accent Line */}
            <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-purple-500/50 to-transparent" />

            {/* System Status Pill Badge */}
            <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-rose-500/20 bg-rose-500/10 px-3.5 py-1 text-xs font-medium text-rose-300 backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
              </span>
              <span>خطأ غير مُتوقَّع</span>
            </div>

            {/* Glowing Icon Container Badge */}
            <div className="group relative mx-auto mb-6 flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-2xl border border-purple-500/30 bg-linear-to-b from-purple-500/15 via-violet-500/10 to-transparent shadow-[0_0_40px_-5px_rgba(168,85,247,0.3)] transition-all duration-300 hover:scale-105">
              <div className="absolute inset-0 rounded-2xl bg-purple-500/20 blur-md transition-all duration-500 group-hover:blur-lg" />
              <svg
                className="relative h-10 w-10 sm:h-12 sm:w-12 text-purple-300 transition-transform duration-300 ease-out group-hover:scale-110"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M12 8V12M12 16H12.01M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 17.5228 22 12 22 12Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            {/* Typography Hierarchy */}
            <h1 className="mb-3 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              حدث خطأ غير مُتوقَّع
            </h1>
            <p className="mx-auto mb-6 max-w-xs text-sm leading-relaxed text-zinc-400 sm:text-base">
              عذرًا، حدث خطأ جذري في التَّطبيق. يُرجَى تحديث الصَّفحة أو إعادة المحاولة.
            </p>

            {/* Dynamic Error Digest Metadata Pill */}
            {error.digest && (
              <div className="mb-6 inline-flex max-w-full items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/80 px-3.5 py-2 text-xs font-mono text-zinc-400 shadow-inner">
                <span className="shrink-0 select-none text-zinc-500">رمز المعرّف:</span>
                <code className="truncate font-mono text-purple-300 select-all">
                  {error.digest}
                </code>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
              <button
                type="button"
                onClick={() => reset()}
                className="group relative inline-flex w-full sm:w-auto flex-1 items-center justify-center gap-2.5 rounded-xl bg-linear-to-r from-purple-600 via-purple-500 to-violet-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-purple-500/25 transition-all duration-300 ease-out hover:shadow-purple-500/40 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 cursor-pointer"
              >
                <svg
                  className="h-4 w-4 transition-transform duration-500 group-hover:rotate-180"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <span>إعادة المحاولة</span>
              </button>

              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex w-full sm:w-auto flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 px-5 py-3.5 text-sm font-medium text-zinc-300 transition-all duration-300 ease-out hover:border-zinc-700 hover:bg-zinc-800 hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 cursor-pointer"
              >
                <svg
                  className="h-4 w-4 text-zinc-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                  />
                </svg>
                <span>تحديث الصَّفحة</span>
              </button>
            </div>

            {/* Secondary Support Context */}
            <p className="mt-8 text-xs text-zinc-500">
              إذا استمرَّت المشكلة، يُرجَى التَّواصل مع الدَّعم الفنِّي.
            </p>
          </div>
        </main>
      </body>
    </html>
  );
}
