import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '404 - الصَّفحة غير موجودة | رؤية رقمية',
  description: 'عذرًا، الصَّفحة التي تبحث عنها غير موجودة أو تمَّ نقلها.',
};

export default function NotFound() {
  return (
    <html lang="ar" dir="rtl" className="h-full">
      <body className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background font-sans text-foreground antialiased selection:bg-primary/20 selection:text-primary">
        {/* Ambient Background Lights & Gradients */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden"
        >
          <div className="h-128 w-lg rounded-full bg-linear-to-tr from-primary/15 via-primary/5 to-transparent blur-3xl" />
          <div className="absolute top-1/3 h-72 w-[18rem] rounded-full bg-primary/10 blur-2xl" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--tw-gradient-stops))] from-transparent via-background/60 to-background" />
        </div>

        {/* Central Card Container */}
        <main className="relative z-10 mx-auto flex w-full max-w-lg flex-col items-center px-4 py-8 text-center sm:px-6">
          <div className="group relative w-full rounded-3xl border border-border/60 bg-card/40 p-8 shadow-2xl shadow-primary/5 backdrop-blur-2xl transition-all duration-500 hover:border-border/80 hover:shadow-primary/10 sm:p-12">
            {/* Elevated Icon Badge */}
            <div className="relative mx-auto mb-6 flex items-center justify-center">
              <div className="absolute -inset-2 rounded-3xl bg-primary/20 blur-xl opacity-60 transition-all duration-500 group-hover:opacity-90 group-hover:blur-2xl" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl border border-primary/20 bg-background/80 text-primary shadow-inner backdrop-blur-md transition-transform duration-500 ease-out group-hover:scale-105 sm:h-24 sm:w-24">
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-10 w-10 text-primary transition-transform duration-300 group-hover:rotate-6 sm:h-12 sm:w-12"
                  aria-hidden="true"
                >
                  <path
                    d="M12 8V12M12 16H12.01M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C17.5228 2 22 6.47715 22 12Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>

            {/* Main Typography & Hierarchy */}
            <h1 className="mb-2 select-none bg-linear-to-b from-foreground via-foreground/90 to-foreground/40 bg-clip-text text-6xl font-black tracking-tight text-transparent drop-shadow-sm sm:text-7xl">
              404
            </h1>
            <h2 className="mb-4 text-2xl font-bold tracking-tight text-primary sm:text-3xl">
              الصَّفحة غير موجودة
            </h2>
            <p className="mx-auto mb-8 max-w-sm text-sm font-medium leading-relaxed text-muted-foreground sm:max-w-md sm:text-base">
              عذرًا، الصَّفحة التي تبحث عنها غير موجودة أو تمَّ نقلها.
            </p>

            {/* Interactive Primary Action Button */}
            <div className="flex justify-center">
              <Link
                href="/"
                className="group/btn relative inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl bg-primary px-8 py-3.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all duration-300 ease-out hover:scale-[1.02] hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/35 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto"
              >
                <span>العودة إلى الرَّئيسيَّة</span>
                <svg
                  className="h-4 w-4 transition-transform duration-300 group-hover/btn:-translate-x-1 rtl:rotate-180"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
                  />
                </svg>
              </Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
