import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import { Card } from '@/frontend/ui/primitives/card';

export function SkeletonHabits() {
  return (
    <div
      role="status"
      aria-label="Loading habits list"
      aria-busy="true"
      className="w-full max-w-3xl mx-auto space-y-4"
    >
      {/* Section Header Skeleton Bar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-6 w-32 rounded-lg bg-neutral-200/80 dark:bg-neutral-800/80" />
          <Skeleton className="h-5 w-12 rounded-full bg-neutral-200/50 dark:bg-neutral-800/50" />
        </div>
        <Skeleton className="h-8 w-24 rounded-lg bg-neutral-200/60 dark:bg-neutral-800/60" />
      </div>

      {/* Habit Items Skeleton List */}
      <div className="space-y-3">
        {[
          { titleWidth: 'w-36', subWidth: 'w-24', streakWidth: 'w-16' },
          { titleWidth: 'w-28', subWidth: 'w-20', streakWidth: 'w-14' },
          { titleWidth: 'w-44', subWidth: 'w-28', streakWidth: 'w-20' },
          { titleWidth: 'w-32', subWidth: 'w-20', streakWidth: 'w-16' },
        ].map((item, i) => (
          <Card
            key={i}
            className="group relative overflow-hidden rounded-2xl border border-neutral-200/80 bg-white/80 p-3.5 sm:p-4 shadow-xs shadow-neutral-900/5 backdrop-blur-md transition-all duration-300 hover:border-neutral-300/80 dark:border-neutral-800/80 dark:bg-neutral-950/80 dark:shadow-black/20 dark:hover:border-neutral-700/80"
          >
            <div className="flex items-center justify-between gap-3 sm:gap-4">
              {/* Left Metadata Group */}
              <div className="flex items-center gap-3 min-w-0">
                <Skeleton className="hidden sm:block h-7 w-2.5 rounded-full bg-neutral-200/60 dark:bg-neutral-800/60 shrink-0" />
                <Skeleton className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-neutral-200/80 dark:bg-neutral-800/80 shrink-0" />
                <div className="space-y-2 min-w-0">
                  <Skeleton
                    className={`h-4 ${item.titleWidth} max-w-35 sm:max-w-none rounded-md bg-neutral-300/70 dark:bg-neutral-700/70`}
                  />
                  <Skeleton
                    className={`h-3 ${item.subWidth} rounded-md bg-neutral-200/70 dark:bg-neutral-800/70`}
                  />
                </div>
              </div>

              {/* Right Interactive & Streak Area */}
              <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
                <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-neutral-100/70 dark:bg-neutral-900/70 border border-neutral-200/40 dark:border-neutral-800/40">
                  {Array.from({ length: 7 }).map((_, dotIdx) => (
                    <Skeleton
                      key={dotIdx}
                      className={`h-2 w-2 rounded-full ${
                        dotIdx < (i * 2 + 3) % 7
                          ? 'bg-neutral-300 dark:bg-neutral-700'
                          : 'bg-neutral-200/40 dark:bg-neutral-800/40'
                      }`}
                    />
                  ))}
                </div>
                <Skeleton
                  className={`hidden sm:block h-7 ${item.streakWidth} rounded-full bg-neutral-200/70 dark:bg-neutral-800/70`}
                />
                <Skeleton className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-neutral-200/90 dark:bg-neutral-800/90 shrink-0" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Accessible Screen Reader Announcement */}
      <span className="sr-only">جارِ تحميل المحتوى...</span>
    </div>
  );
}
