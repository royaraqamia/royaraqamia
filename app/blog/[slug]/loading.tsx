import { Skeleton } from '@/components/ui/skeleton';

export default function BlogPostLoading() {
  return (
    <article className="max-w-3xl mx-auto">
      <Skeleton className="h-9 w-28 rounded-lg mb-8" />
      <Skeleton className="aspect-video w-full rounded-2xl mb-8" />
      <Skeleton className="h-10 w-3/4 rounded-lg mb-4" />
      <div className="flex items-center gap-4 mb-10">
        <Skeleton className="size-7 rounded-full" />
        <Skeleton className="h-4 w-24 rounded-lg" />
        <Skeleton className="h-4 w-20 rounded-lg" />
        <Skeleton className="h-4 w-16 rounded-lg" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-full rounded-lg" />
        <Skeleton className="h-4 w-full rounded-lg" />
        <Skeleton className="h-4 w-5/6 rounded-lg" />
        <Skeleton className="h-4 w-full rounded-lg" />
        <Skeleton className="h-4 w-4/5 rounded-lg" />
        <Skeleton className="h-4 w-full rounded-lg" />
        <Skeleton className="h-4 w-3/4 rounded-lg" />
      </div>
    </article>
  );
}
