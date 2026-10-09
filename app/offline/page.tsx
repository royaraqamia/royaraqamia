import type { Metadata } from 'next';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

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
      {/* Modern grid pattern */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[24px_24px] mask-[radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />

      <main className="w-full max-w-md">
        <article
          className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 p-6 shadow-2xl transition-safe duration-300 hover:border-slate-300/90 sm:p-8 lg:p-10 dark:border-slate-800/80 dark:bg-slate-900/80 dark:shadow-slate-950/80 dark:hover:border-slate-700/80"
          role="status"
          aria-live="polite"
        >
          {/* Subtle top accent gradient line */}
          <div className="absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-amber-500/50 to-transparent" />

          {/* Offline Icon Container with live status indicator */}
          <div className="mb-6 flex flex-col items-center">
            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20 shadow-inner sm:h-22 sm:w-22 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-500/30">
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
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
            <SectionTitle as="h1">
              غير <SectionTitleHighlight>متَّصل</SectionTitleHighlight>
            </SectionTitle>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base dark:text-slate-400">
              يبدو أنَّك غير متَّصل بالإنترنت. حاول مرَّة أخرى عندما تتوفَّر لديك شبكة.
            </p>
          </div>

          {/* Interactive Action Control */}
          <div className="mt-8 flex flex-col gap-3">
            <a
              href="."
              className="group relative flex h-13 w-full items-center justify-center gap-2.5 overflow-hidden rounded-full border border-white/20 bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600 px-6 text-base font-bold! text-white shadow-[0_10px_30px_-10px_rgba(147,51,234,0.5)] transition-transform duration-300 hover:scale-[1.02] hover:from-purple-500 hover:via-violet-500 hover:to-indigo-500 hover:shadow-[0_15px_35px_-5px_rgba(147,51,234,0.7)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:h-14 sm:px-8 sm:text-lg"
            >
              <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/25 to-transparent -translate-x-full transition-transform duration-1000 ease-in-out group-hover:translate-x-full" />
              <span className="relative z-10">إعادة المحاولة</span>
            </a>
          </div>
        </article>
      </main>
    </div>
  );
}
