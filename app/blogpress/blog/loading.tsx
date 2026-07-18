import { Skeleton } from '@/components/ui/skeleton';

export default function BlogLoading() {
  return (
    <div>
      <div className="mb-12">
        <Skeleton className="h-10 w-28 rounded-lg" />
        <Skeleton className="h-5 w-48 mt-3 rounded-lg" />
      </div>
      <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3">
            <Skeleton className="aspect-video w-full rounded-xl" />
            <Skeleton className="h-6 w-3/4 rounded-lg" />
            <Skeleton className="h-4 w-full rounded-lg" />
            <Skeleton className="h-3 w-32 mt-1 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
