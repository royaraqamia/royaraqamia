import { Skeleton } from '@/frontend/ui/primitives/skeleton';

export default function BlogPostLoading() {
  return (
    <article
      className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12 md:py-16 lg:px-8 transition-all duration-300 ease-in-out"
      aria-busy="true"
      aria-label="Loading blog post content"
    >
      {/* Category Pill & Top Action Skeleton */}
      <nav
        aria-label="Breadcrumb navigation loading state"
        className="mb-6 sm:mb-8 flex items-center justify-between gap-4"
      >
        <Skeleton className="h-8 w-28 rounded-full border border-neutral-200/50 dark:border-neutral-800/50" />
        <Skeleton className="size-8 rounded-full border border-neutral-200/50 dark:border-neutral-800/50" />
      </nav>

      {/* Main Multi-Line Article Title Skeleton */}
      <header className="mb-6 sm:mb-8 space-y-3">
        <Skeleton className="h-9 sm:h-11 md:h-12 w-full rounded-xl sm:rounded-2xl" />
        <Skeleton className="h-9 sm:h-11 md:h-12 w-3/4 rounded-xl sm:rounded-2xl" />
      </header>

      {/* Author Profile & Publication Metadata Bar */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-y border-neutral-200/60 dark:border-neutral-800/60 py-4">
        <div className="flex items-center gap-3.5">
          <Skeleton className="size-10 sm:size-11 rounded-full shrink-0 ring-2 ring-neutral-100 dark:ring-neutral-800" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28 rounded-md" />
            <Skeleton className="h-3.5 w-20 rounded-md" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-16 rounded-full" />
          <Skeleton className="h-7 w-20 rounded-full" />
        </div>
      </div>

      {/* Hero Banner / Featured Image Container */}
      <div className="relative mb-10 sm:mb-12 overflow-hidden rounded-2xl sm:rounded-3xl border border-neutral-200/60 dark:border-neutral-800/60 shadow-xs sm:shadow-sm">
        <Skeleton className="aspect-video w-full rounded-2xl sm:rounded-3xl" />
      </div>

      {/* Dynamic Content Reading Flow Skeleton */}
      <section className="space-y-8" aria-label="Article body loading state">
        {/* Paragraph Block 1 */}
        <div className="space-y-3">
          <Skeleton className="h-4 w-full rounded-md" />
          <Skeleton className="h-4 w-full rounded-md" />
          <Skeleton className="h-4 w-[94%] rounded-md" />
          <Skeleton className="h-4 w-[88%] rounded-md" />
        </div>

        {/* Featured Callout / Blockquote Container */}
        <div className="rounded-2xl border border-neutral-200/60 dark:border-neutral-800/60 bg-neutral-50/50 dark:bg-neutral-900/30 p-5 sm:p-6 space-y-2.5">
          <Skeleton className="h-4 w-[95%] rounded-md" />
          <Skeleton className="h-4 w-[80%] rounded-md" />
        </div>

        {/* Section Heading Placeholder */}
        <Skeleton className="h-7 sm:h-8 w-1/2 rounded-lg my-6" />

        {/* Paragraph Block 2 */}
        <div className="space-y-3">
          <Skeleton className="h-4 w-full rounded-md" />
          <Skeleton className="h-4 w-[98%] rounded-md" />
          <Skeleton className="h-4 w-full rounded-md" />
          <Skeleton className="h-4 w-[75%] rounded-md" />
        </div>
      </section>

      {/* Article Tag Footer */}
      <footer className="mt-12 pt-6 border-t border-neutral-200/60 dark:border-neutral-800/60 flex items-center gap-2">
        <Skeleton className="h-6 w-14 rounded-full" />
        <Skeleton className="h-6 w-18 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </footer>
    </article>
  );
}
