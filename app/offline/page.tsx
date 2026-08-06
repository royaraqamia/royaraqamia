import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'غير متَّصل',
  description: 'أنت غير متَّصل بالإنترنت. حاول مرَّة أخرى عندما تتوفَّر لديك شبكة.',
};

export default function OfflinePage() {
  return (
    <div
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-slate-50 p-4 font-sans text-slate-900 antialiased selection:bg-amber-500/20 selection:text-amber-800 sm:p-6 lg:p-8 dark:bg-slate-950 dark:text-slate-100 dark:selection:bg-amber-500/30 dark:selection:text-amber-200"
      dir="rtl"
    >
      {/* Ambient background lighting effects & modern grid pattern */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-amber-500/10 via-slate-50/50 to-slate-50 dark:from-amber-500/10 dark:via-slate-950 dark:to-slate-950" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -z-10 h-80 w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-linear-to-tr from-amber-500/20 via-orange-500/10 to-rose-500/20 blur-3xl sm:h-120 sm:w-120" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[24px_24px] mask-[radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />

      <main className="w-full max-w-md">
        <article
          className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 p-6 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:border-slate-300/90 sm:p-8 lg:p-10 dark:border-slate-800/80 dark:bg-slate-900/80 dark:shadow-slate-950/80 dark:hover:border-slate-700/80"
          role="status"
          aria-live="polite"
        >
          {/* Subtle top accent gradient line */}
          <div className="absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-amber-500/50 to-transparent" />

          {/* Offline Icon Container with live status indicator */}
          <div className="mb-6 flex flex-col items-center">
            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20 shadow-inner sm:h-22 sm:w-22 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-500/30">
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex h-4 w-4 rounded-full bg-amber-500"></span>
              </span>
              <svg
                className="h-10 w-10 transition-transform duration-300 hover:scale-110 sm:h-11 sm:w-11"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M18.364 5.636a9 9 0 0 1 0 12.728m-12.728 0a9 9 0 0 1 0-12.728m9.9 2.829a5.25 5.25 0 0 1 0 7.07m-7.072 0a5.25 5.25 0 0 1 0-7.07M12 12v.008"
                />
              </svg>
            </div>
          </div>

          {/* Primary Typography & Status Header */}
          <div className="text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
              <span>انقطع الاتِّصال بالشَّبكة</span>
            </div>

            <h1 className="font-arabic text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              غير متَّصل
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base dark:text-slate-400">
              يبدو أنَّك غير متَّصل بالإنترنت. حاول مرَّة أخرى عندما تتوفَّر لديك شبكة.
            </p>
          </div>

          {/* Interactive Action Control */}
          <div className="mt-8 flex flex-col gap-3">
            <a
              href="."
              className="group relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-xl bg-slate-900 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-all duration-200 ease-out hover:bg-slate-800 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:bg-slate-100 dark:text-slate-900 dark:shadow-slate-100/5 dark:hover:bg-white dark:focus-visible:ring-offset-slate-900"
            >
              <svg
                className="h-4 w-4 transition-transform duration-500 group-hover:rotate-180"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span>إعادة المحاولة</span>
            </a>
          </div>

          {/* Troubleshooting Checklist */}
          <div className="mt-6 rounded-2xl border border-slate-200/60 bg-slate-50/50 p-4 text-right dark:border-slate-800/60 dark:bg-slate-950/50">
            <span className="mb-2 block text-xs font-semibold text-slate-500 dark:text-slate-400">
              خطوات سريعة للتَّحقُّق:
            </span>
            <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500/70 shrink-0"></span>
                <span>تأكَّد من تفعيل اتِّصال Wi-Fi أو بيانات الهاتف</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500/70 shrink-0"></span>
                <span>أعِد تشغيل جهاز الـ Router إن أمكن</span>
              </li>
            </ul>
          </div>
        </article>

        {/* Footer status text */}
        <footer className="mt-6 text-center text-xs text-slate-400 dark:text-slate-600">
          سيتمُّ استئناف الاتِّصال تلقائيًّا فور توفُّر الشَّبكة
        </footer>
      </main>
    </div>
  );
}
