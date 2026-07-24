import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
        <div>
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-4 w-44 mt-2 rounded-lg" />
        </div>
        <Skeleton className="h-9 w-28 rounded-xl" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/50 bg-card p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-lg" />
              <div className="min-w-0 space-y-2">
                <Skeleton className="h-6 w-16 rounded-lg" />
                <Skeleton className="h-3 w-20 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="flex items-center gap-1 border-b border-border/50">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-16 rounded-lg" />
          ))}
        </div>
        <Skeleton className="sm:mr-auto h-9 w-[200px] rounded-lg" />
      </div>

      <div className="divide-y divide-border/50">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-4">
            <Skeleton className="size-12 rounded-lg shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton className="h-4 w-48 rounded-lg" />
              <Skeleton className="h-3 w-64 rounded-lg" />
            </div>
            <Skeleton className="h-6 w-14 rounded-full shrink-0" />
            <Skeleton className="size-8 rounded-lg shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
