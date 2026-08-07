import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import { Card } from '@/frontend/ui/primitives/card';

export function SkeletonCalendar() {
  return (
    <Card
      role="status"
      aria-label="Loading calendar content"
      aria-busy="true"
      className="relative w-full max-w-5xl mx-auto overflow-hidden rounded-2xl border border-neutral-200/80 bg-white/80 p-4 sm:p-6 lg:p-8 shadow-xl shadow-neutral-900/5 backdrop-blur-xl transition-all duration-300 dark:border-neutral-800/80 dark:bg-neutral-950/80 dark:shadow-black/40"
    >
      {/* Calendar Header Skeleton: Title, Nav Controls & View Switcher */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Month Title & Navigation Skeleton */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-36 sm:w-44 rounded-lg bg-neutral-200/80 dark:bg-neutral-800/80" />
          <div className="flex items-center gap-1.5 pl-2 border-l border-neutral-200 dark:border-neutral-800">
            <Skeleton className="h-8 w-8 rounded-lg bg-neutral-200/60 dark:bg-neutral-800/60" />
            <Skeleton className="h-8 w-16 rounded-lg bg-neutral-200/60 dark:bg-neutral-800/60" />
            <Skeleton className="h-8 w-8 rounded-lg bg-neutral-200/60 dark:bg-neutral-800/60" />
          </div>
        </div>

        {/* View Mode Segmented Control Skeleton (Month / Week / Day) */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto rounded-xl bg-neutral-100/80 p-1 border border-neutral-200/50 dark:bg-neutral-900/80 dark:border-neutral-800/50">
          <Skeleton className="h-7 w-16 rounded-lg bg-white dark:bg-neutral-800 shadow-xs" />
          <Skeleton className="h-7 w-16 rounded-lg bg-transparent" />
          <Skeleton className="h-7 w-16 rounded-lg bg-transparent" />
        </div>
      </div>

      {/* Weekday Column Headers Skeleton */}
      <div className="mb-3 grid grid-cols-7 gap-1 sm:gap-2 text-center">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={`weekday-skeleton-${i}`} className="flex justify-center items-center py-1">
            <Skeleton className="h-3.5 w-8 sm:w-12 rounded-full bg-neutral-200/80 dark:bg-neutral-800/80" />
          </div>
        ))}
      </div>

      {/* Realistic Monthly Days Grid Skeleton (7 Columns x 5 Weeks) */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2.5 md:gap-3">
        {Array.from({ length: 35 }).map((_, i) => {
          // Dim leading/trailing days from adjacent months
          const isAdjacentMonth = i < 2 || i >= 33;
          const hasEvents = !isAdjacentMonth && (i % 3 === 0 || i % 5 === 0);
          const eventCount = i % 5 === 0 ? 2 : 1;

          return (
            <div
              key={`day-skeleton-${i}`}
              className={`group relative flex flex-col justify-between aspect-square sm:aspect-4/3 p-1.5 sm:p-2.5 rounded-xl sm:rounded-2xl border transition-all duration-200 ${
                isAdjacentMonth
                  ? 'border-neutral-100/60 bg-neutral-50/40 opacity-40 dark:border-neutral-900/40 dark:bg-neutral-900/20'
                  : 'border-neutral-200/60 bg-neutral-50/60 dark:border-neutral-800/60 dark:bg-neutral-900/40'
              }`}
            >
              {/* Day Number Placeholder */}
              <div className="flex items-center justify-between w-full">
                <Skeleton className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-md bg-neutral-300/60 dark:bg-neutral-700/60" />
              </div>

              {/* Dynamic Event Pill Placeholders */}
              {hasEvents && (
                <div className="mt-auto flex flex-col gap-1 w-full pt-1">
                  <Skeleton
                    className={`h-1.5 sm:h-2 rounded-full bg-neutral-300/70 dark:bg-neutral-700/70 ${
                      i % 2 === 0 ? 'w-[85%]' : 'w-[65%]'
                    }`}
                  />
                  {eventCount > 1 && (
                    <Skeleton className="hidden sm:block h-1.5 sm:h-2 w-[45%] rounded-full bg-neutral-200 dark:bg-neutral-800" />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Accessible Screen Reader Announcement */}
      <span className="sr-only">جارِ تحميل المحتوى...</span>
    </Card>
  );
}
