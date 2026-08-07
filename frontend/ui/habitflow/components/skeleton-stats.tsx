import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import { Card } from '@/frontend/ui/primitives/card';

export function SkeletonStats() {
  const statsConfig = [
    {
      labelWidth: 'w-24',
      subLabelWidth: 'w-16',
      badgeWidth: 'w-14',
      valueWidth: 'w-28',
      subtextWidth: 'w-32',
    },
    {
      labelWidth: 'w-20',
      subLabelWidth: 'w-12',
      badgeWidth: 'w-12',
      valueWidth: 'w-20',
      subtextWidth: 'w-28',
    },
    {
      labelWidth: 'w-28',
      subLabelWidth: 'w-16',
      badgeWidth: 'w-16',
      valueWidth: 'w-32',
      subtextWidth: 'w-36',
    },
    {
      labelWidth: 'w-22',
      subLabelWidth: 'w-14',
      badgeWidth: 'w-12',
      valueWidth: 'w-24',
      subtextWidth: 'w-24',
    },
  ];

  return (
    <div
      role="status"
      aria-label="Loading statistics"
      aria-busy="true"
      className="w-full max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6"
    >
      {statsConfig.map((stat, i) => (
        <Card
          key={i}
          className="group relative overflow-hidden rounded-2xl border border-neutral-200/80 bg-white/80 p-4 sm:p-5 shadow-xs shadow-neutral-900/5 backdrop-blur-md transition-all duration-300 hover:border-neutral-300/80 dark:border-neutral-800/80 dark:bg-neutral-950/80 dark:shadow-black/20 dark:hover:border-neutral-700/80 flex flex-col justify-between gap-4"
        >
          {/* Header Row: Category Icon, Label & Trend Badge Placeholder */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Skeleton className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-neutral-200/80 dark:bg-neutral-800/80 shrink-0" />
              <div className="space-y-1.5 min-w-0">
                <Skeleton
                  className={`h-3.5 ${stat.labelWidth} rounded-md bg-neutral-300/70 dark:bg-neutral-700/70`}
                />
                <Skeleton
                  className={`h-2.5 ${stat.subLabelWidth} rounded-md bg-neutral-200/50 dark:bg-neutral-800/50`}
                />
              </div>
            </div>
            <Skeleton
              className={`h-5 ${stat.badgeWidth} rounded-full bg-neutral-200/70 dark:bg-neutral-800/70 shrink-0`}
            />
          </div>

          {/* Body Row: Main Metric Value, Sparkline Indicator & Subtext */}
          <div className="space-y-2 pt-1">
            <div className="flex items-baseline justify-between gap-2">
              <Skeleton
                className={`h-7 sm:h-8 ${stat.valueWidth} rounded-lg bg-neutral-300/80 dark:bg-neutral-700/80`}
              />
              {/* Sparkline Graphic Skeleton */}
              <div className="flex items-end gap-1 h-5 shrink-0" aria-hidden="true">
                <Skeleton className="w-1 h-2 rounded-full bg-neutral-200/60 dark:bg-neutral-800/60" />
                <Skeleton className="w-1 h-3.5 rounded-full bg-neutral-300/80 dark:bg-neutral-700/80" />
                <Skeleton className="w-1 h-5 rounded-full bg-neutral-200/60 dark:bg-neutral-800/60" />
                <Skeleton className="w-1 h-3 rounded-full bg-neutral-300/80 dark:bg-neutral-700/80" />
              </div>
            </div>
            <Skeleton
              className={`h-3 ${stat.subtextWidth} rounded-md bg-neutral-200/60 dark:bg-neutral-800/60`}
            />
          </div>
        </Card>
      ))}

      {/* Accessible Screen Reader Announcement */}
      <span className="sr-only">جارِ تحميل المحتوى...</span>
    </div>
  );
}
