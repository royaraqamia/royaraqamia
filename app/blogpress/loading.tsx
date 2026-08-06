import { Skeleton } from '@/frontend/ui/primitives/skeleton';

export default function DashboardLoading() {
  return (
    <div
      role="status"
      aria-label="جارٍ تحميل المحتوى"
      aria-busy="true"
      className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 animate-in fade-in duration-500"
    >
      <span className="sr-only">جارٍ تحميل المحتوى...</span>

      {/* Header Section */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/30">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40 sm:w-56 rounded-xl bg-muted/80" />
          <Skeleton className="h-4 w-56 sm:w-80 rounded-lg bg-muted/50" />
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <Skeleton className="h-10 w-28 rounded-xl bg-muted/80" />
          <Skeleton className="h-10 w-32 rounded-xl bg-muted/80" />
        </div>
      </header>

      {/* Metric Cards Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-5 shadow-xs backdrop-blur-sm"
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <Skeleton className="size-11 rounded-xl bg-muted/70 shrink-0" />
              <Skeleton className="h-5 w-14 rounded-full bg-muted/50" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-20 rounded-md bg-muted/50" />
              <Skeleton className="h-7 w-28 rounded-lg bg-muted/80" />
            </div>
            <div className="mt-4 pt-3 border-t border-border/30 flex items-center justify-between">
              <Skeleton className="h-3 w-24 rounded-md bg-muted/40" />
              <Skeleton className="h-3 w-8 rounded-md bg-muted/40" />
            </div>
          </div>
        ))}
      </section>

      {/* Filter / Navigation Bar */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 p-1 bg-muted/30 rounded-xl border border-border/40 w-full sm:w-auto overflow-x-auto">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 sm:w-24 rounded-lg bg-muted/70 shrink-0" />
          ))}
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Skeleton className="h-9 w-full sm:w-64 rounded-xl bg-muted/70" />
          <Skeleton className="h-9 w-9 rounded-xl bg-muted/70 shrink-0" />
        </div>
      </section>

      {/* Data Table / Activity List Section */}
      <section className="rounded-2xl border border-border/60 bg-card/40 shadow-xs backdrop-blur-sm overflow-hidden divide-y divide-border/40">
        <div className="p-4 sm:p-5 border-b border-border/40 flex items-center justify-between bg-muted/10">
          <Skeleton className="h-5 w-32 rounded-lg bg-muted/70" />
          <Skeleton className="h-4 w-20 rounded-lg bg-muted/50" />
        </div>
        <div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3 sm:gap-4 p-4 sm:p-4.5">
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <Skeleton className="size-10 sm:size-11 rounded-xl bg-muted/70 shrink-0" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-3/4 sm:w-48 rounded-lg bg-muted/80" />
                  <Skeleton className="h-3 w-full max-w-60 rounded-md bg-muted/50" />
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <Skeleton className="hidden sm:inline-block h-6 w-16 sm:w-20 rounded-full bg-muted/60" />
                <Skeleton className="hidden md:inline-block h-4 w-24 rounded-md bg-muted/40" />
                <Skeleton className="size-8 rounded-lg bg-muted/60" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
