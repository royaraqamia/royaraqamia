import { Skeleton } from '@/frontend/ui/primitives/skeleton';

export function DashboardSkeleton() {
  return (
    <section
      aria-label="جارٍ تحميل المحتوى"
      aria-busy="true"
      className="w-full max-w-7xl mx-auto space-y-6 animate-in fade-in-50 duration-500"
    >
      {/* Top Navigation / Section Header */}
      <header className="flex items-center justify-between gap-4 pb-4 border-b border-neutral-200/60 dark:border-neutral-800/60">
        <div className="space-y-2">
          <Skeleton className="h-6 w-36 sm:w-44 rounded-lg bg-neutral-200/80 dark:bg-neutral-800/80" />
          <Skeleton className="h-4 w-48 sm:w-64 rounded-md bg-neutral-200/60 dark:bg-neutral-800/60 hidden sm:block opacity-75" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-lg bg-neutral-200/80 dark:bg-neutral-800/80" />
        </div>
      </header>

      {/* Primary Dashboard Card Stack */}
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <article
            key={i}
            className="group relative h-32 w-full overflow-hidden rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white/60 dark:bg-neutral-900/60 p-5 sm:p-6 backdrop-blur-md shadow-xs transition-all duration-300 hover:border-neutral-300 dark:hover:border-neutral-700 flex flex-col justify-between"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-xl shrink-0 bg-neutral-200/80 dark:bg-neutral-800/80" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-28 sm:w-36 rounded-md bg-neutral-200/80 dark:bg-neutral-800/80" />
                  <Skeleton className="h-3 w-16 sm:w-24 rounded-md bg-neutral-200/60 dark:bg-neutral-800/60 opacity-60" />
                </div>
              </div>
              <Skeleton className="h-6 w-16 rounded-full shrink-0 bg-neutral-200/80 dark:bg-neutral-800/80" />
            </div>

            <div className="flex items-end justify-between gap-4">
              <Skeleton className="h-7 w-28 sm:w-36 rounded-lg bg-neutral-200/80 dark:bg-neutral-800/80" />
              <Skeleton className="h-3.5 w-24 sm:w-32 rounded-md bg-neutral-200/60 dark:bg-neutral-800/60 opacity-70 hidden sm:block" />
            </div>
          </article>
        ))}
      </div>
      <span className="sr-only">جارٍ تحميل المحتوى...</span>
    </section>
  );
}

export function AnalyticsSkeleton() {
  return (
    <section
      aria-label="جارٍ تحميل المحتوى"
      aria-busy="true"
      className="w-full max-w-7xl mx-auto space-y-6 animate-in fade-in-50 duration-500"
    >
      {/* Metric Summary Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <article
            key={i}
            className="h-24 p-4 rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white/60 dark:bg-neutral-900/60 backdrop-blur-md shadow-xs flex flex-col justify-between transition-all duration-300 hover:border-neutral-300 dark:hover:border-neutral-700"
          >
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-24 rounded-md bg-neutral-200/80 dark:bg-neutral-800/80 opacity-80" />
              <Skeleton className="h-4 w-4 rounded-md bg-neutral-200/60 dark:bg-neutral-800/60 opacity-60" />
            </div>
            <div className="flex items-end justify-between gap-2">
              <Skeleton className="h-7 w-20 rounded-lg bg-neutral-200/80 dark:bg-neutral-800/80" />
              <Skeleton className="h-5 w-12 rounded-full bg-neutral-200/80 dark:bg-neutral-800/80" />
            </div>
          </article>
        ))}
      </div>

      {/* Main Analytics Chart Feature Block */}
      <div className="h-64 rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white/60 dark:bg-neutral-900/60 p-5 sm:p-6 backdrop-blur-md shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-200/40 dark:border-neutral-800/40">
          <Skeleton className="h-5 w-36 rounded-md bg-neutral-200/80 dark:bg-neutral-800/80" />
          <div className="flex gap-2">
            <Skeleton className="h-7 w-16 rounded-lg bg-neutral-200/80 dark:bg-neutral-800/80" />
            <Skeleton className="h-7 w-16 rounded-lg bg-neutral-200/80 dark:bg-neutral-800/80 hidden sm:block" />
          </div>
        </div>

        {/* Simulated Bar Chart Dynamic Columns */}
        <div className="flex items-end justify-between gap-2 h-40 pt-4 px-2">
          {[40, 65, 30, 85, 50, 95, 70, 45, 80, 60, 90, 75].map((heightPct, idx) => (
            <div key={idx} className="flex-1 flex justify-center h-full items-end">
              <Skeleton
                className="w-full max-w-7 rounded-t-md bg-neutral-200/80 dark:bg-neutral-800/80 transition-all duration-300"
                style={{ height: `${heightPct}%` }}
              />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">جارٍ تحميل المحتوى...</span>
    </section>
  );
}

export function AdminSkeleton() {
  return (
    <section
      aria-label="جارٍ تحميل المحتوى"
      aria-busy="true"
      className="w-full max-w-7xl mx-auto space-y-8 animate-in fade-in-50 duration-500"
    >
      {/* Header & Primary Action CTA Bar */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-200/60 dark:border-neutral-800/60">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40 sm:w-48 rounded-lg bg-neutral-200/80 dark:bg-neutral-800/80" />
          <Skeleton className="h-4 w-56 sm:w-72 rounded-md bg-neutral-200/60 dark:bg-neutral-800/60 opacity-75" />
        </div>
        <Skeleton className="h-9 w-32 rounded-xl bg-neutral-200/80 dark:bg-neutral-800/80 shadow-xs shrink-0" />
      </header>

      {/* Admin Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <article
            key={i}
            className="h-28 rounded-3xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white/60 dark:bg-neutral-900/60 p-5 backdrop-blur-md shadow-xs flex flex-col justify-between transition-all duration-300 hover:border-neutral-300 dark:hover:border-neutral-700"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28 rounded-md bg-neutral-200/80 dark:bg-neutral-800/80 opacity-75" />
              <Skeleton className="h-6 w-6 rounded-lg bg-neutral-200/80 dark:bg-neutral-800/80" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-7 w-32 rounded-lg bg-neutral-200/80 dark:bg-neutral-800/80" />
              <Skeleton className="h-3 w-40 rounded-md bg-neutral-200/60 dark:bg-neutral-800/60 opacity-60" />
            </div>
          </article>
        ))}
      </div>

      {/* Data Table Section Wrapper */}
      <div className="space-y-1 rounded-3xl overflow-hidden border border-neutral-200/80 dark:border-neutral-800/80 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-md shadow-xs">
        {/* Table Header Bar */}
        <div className="h-12 rounded-t-3xl bg-neutral-100/80 dark:bg-neutral-800/80 px-6 flex items-center justify-between border-b border-neutral-200/80 dark:border-neutral-800/80">
          <Skeleton className="h-4 w-28 rounded-md bg-neutral-300/60 dark:bg-neutral-700/60" />
          <Skeleton className="h-4 w-20 rounded-md bg-neutral-300/60 dark:bg-neutral-700/60 hidden sm:block" />
          <Skeleton className="h-4 w-16 rounded-md bg-neutral-300/60 dark:bg-neutral-700/60 hidden md:block" />
          <Skeleton className="h-4 w-16 rounded-md bg-neutral-300/60 dark:bg-neutral-700/60" />
        </div>

        {/* Table Data Rows */}
        <div className="divide-y divide-neutral-200/40 dark:divide-neutral-800/40">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-16 px-6 flex items-center justify-between transition-colors hover:bg-neutral-100/30 dark:hover:bg-neutral-800/30"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-full shrink-0 bg-neutral-200/80 dark:bg-neutral-800/80" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-28 sm:w-36 rounded-md bg-neutral-200/80 dark:bg-neutral-800/80" />
                  <Skeleton className="h-3 w-32 sm:w-44 rounded-md bg-neutral-200/60 dark:bg-neutral-800/60 opacity-60" />
                </div>
              </div>
              <Skeleton className="h-6 w-20 rounded-full bg-neutral-200/80 dark:bg-neutral-800/80 hidden sm:block" />
              <Skeleton className="h-4 w-24 rounded-md bg-neutral-200/80 dark:bg-neutral-800/80 hidden md:block opacity-75" />
              <Skeleton className="h-8 w-8 rounded-lg shrink-0 bg-neutral-200/80 dark:bg-neutral-800/80" />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">جارٍ تحميل المحتوى...</span>
    </section>
  );
}
