import { Skeleton } from '@/components/ui/skeleton';

export default function BlogLoading() {
  return (
    <div>
      <div className="relative overflow-hidden mb-14 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-background border border-border/50 p-8 md:p-12">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
            backgroundSize: '40px 40px',
          }}
        />
        <Skeleton className="h-5 w-20 rounded-full mb-4" />
        <Skeleton className="h-10 w-32 rounded-lg" />
        <Skeleton className="h-5 w-64 mt-3 rounded-lg" />
        <Skeleton className="h-11 w-full max-w-md mt-6 rounded-xl" />
      </div>
      <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border/50 bg-card overflow-hidden">
            <Skeleton className="aspect-video w-full rounded-none" />
            <div className="p-5 space-y-3">
              <Skeleton className="h-5 w-3/4 rounded-lg" />
              <Skeleton className="h-4 w-full rounded-lg" />
              <Skeleton className="h-4 w-1/2 rounded-lg" />
              <div className="pt-4 border-t border-border/30">
                <Skeleton className="h-3 w-28 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
