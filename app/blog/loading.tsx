import { Skeleton } from '@/frontend/ui/primitives/skeleton';

export default function BlogLoading() {
  return (
    <section
      role="status"
      aria-busy="true"
      aria-label="Loading blog posts"
      className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 md:py-16 space-y-12 sm:space-y-16"
    >
      {/* Featured Hero Header Skeleton */}
      <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/40 p-6 sm:p-10 md:p-12 lg:p-16 shadow-xl shadow-black/2 dark:shadow-black/20 backdrop-blur-xl">
        {/* Ambient Gradient & Texture Accents */}
        <div className="absolute inset-0 bg-linear-to-br from-primary/10 via-primary/5 to-transparent pointer-events-none" />
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl space-y-6">
          {/* Badge & Category Pills Skeleton */}
          <div className="flex items-center space-x-2">
            <Skeleton className="h-6 w-28 rounded-full border border-border/40 bg-muted/60" />
            <Skeleton className="h-6 w-20 rounded-full border border-border/40 bg-muted/40" />
          </div>

          {/* Headline Skeleton */}
          <div className="space-y-3">
            <Skeleton className="h-8 sm:h-10 md:h-12 w-full max-w-2xl rounded-xl" />
            <Skeleton className="h-8 sm:h-10 md:h-12 w-3/4 rounded-xl" />
          </div>

          {/* Subtitle / Excerpt Skeleton */}
          <div className="space-y-2 pt-1">
            <Skeleton className="h-4 sm:h-5 w-full max-w-xl rounded-lg" />
            <Skeleton className="h-4 sm:h-5 w-2/3 rounded-lg" />
          </div>

          {/* Search & Action Controls Skeleton */}
          <div className="pt-4 sm:pt-6">
            <div className="flex items-center gap-3 w-full max-w-md p-1.5 rounded-2xl border border-border/40 bg-background/60 backdrop-blur-md shadow-inner">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-24 shrink-0 rounded-xl" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="space-y-8">
        {/* Navigation / Filter Bar Skeleton */}
        <div className="flex items-center justify-between pb-4 border-b border-border/40 overflow-x-auto no-scrollbar">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <Skeleton className="h-9 w-20 rounded-xl shrink-0" />
            <Skeleton className="h-9 w-24 rounded-xl shrink-0" />
            <Skeleton className="h-9 w-28 rounded-xl shrink-0" />
            <Skeleton className="h-9 w-20 rounded-xl shrink-0 hidden sm:block" />
          </div>
          <Skeleton className="h-9 w-32 rounded-xl shrink-0 hidden md:block" />
        </div>

        {/* Responsive Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <article
              key={i}
              className="flex flex-col justify-between overflow-hidden rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-xs transition-all duration-300 hover:border-border/80"
            >
              {/* Media Thumbnail Skeleton */}
              <div className="relative aspect-16/10 w-full overflow-hidden bg-muted/30">
                <Skeleton className="h-full w-full rounded-none" />
                <div className="absolute top-3.5 left-3.5">
                  <Skeleton className="h-5 w-16 rounded-md bg-background/80 backdrop-blur-md border border-border/30" />
                </div>
              </div>

              {/* Card Body Skeleton */}
              <div className="flex flex-1 flex-col justify-between p-5 sm:p-6 space-y-5">
                {/* Author Metadata Skeleton */}
                <div className="flex items-center space-x-3">
                  <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-3.5 w-24 rounded-md" />
                    <Skeleton className="h-3 w-16 rounded-md" />
                  </div>
                </div>

                {/* Article Title & Body Excerpt Skeleton */}
                <div className="space-y-2.5 flex-1">
                  <Skeleton className="h-5 w-11/12 rounded-lg" />
                  <Skeleton className="h-5 w-4/5 rounded-lg" />
                  <div className="pt-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-full rounded-md" />
                    <Skeleton className="h-3.5 w-5/6 rounded-md" />
                  </div>
                </div>

                {/* Card Footer Skeleton */}
                <div className="pt-4 border-t border-border/30 flex items-center justify-between">
                  <Skeleton className="h-3.5 w-20 rounded-md" />
                  <Skeleton className="h-4 w-4 rounded-full" />
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
