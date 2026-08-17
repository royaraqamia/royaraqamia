import type { Metadata } from 'next';
import { Suspense } from 'react';
import { loadBlogIndex } from '@/backend/loaders/blog';
import { BlogSearch } from './_components/blog-search';
import { BlogIndexResults } from './_components/blog-index-results';
import { BlogResults } from './_components/blog-results';
import { BLOG_PAGE_SIZE } from './_components/constants';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'المدوَّنة',
  description: 'أفكار، دروس، وقصص في العالم الرَّقمي',
};

export default async function BlogPage() {
  const { posts, totalPages } = await loadBlogIndex(1, '', BLOG_PAGE_SIZE);

  return (
    <div className="min-h-screen text-foreground selection:bg-primary/30 selection:text-white pb-24">
      {/* Editorial Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-20 md:pt-24 md:pb-24 lg:pt-28 lg:pb-28 border-b border-border">
        {/* Deep Ambient Background Glows */}
        <div
          aria-hidden="true"
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(900px,100vw)] h-[min(600px,100vw)] bg-linear-to-tr from-primary/20 via-indigo-500/10 to-transparent blur-[130px] rounded-full pointer-events-none -z-10"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-size-[4rem_4rem] mask-[radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none -z-10"
        />

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center text-center">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-transparent bg-clip-text bg-linear-to-b from-foreground via-foreground/80 to-muted-foreground leading-[1.15] mb-6">
            المدوَّنة
          </h1>

          <p className="text-base sm:text-lg lg:text-xl text-muted-foreground max-w-xl font-normal leading-relaxed mb-10 text-balance">
            أفكار، دروس، وقصص في العالم الرَّقمي
          </p>

          <div className="w-full max-w-lg relative z-20">
            <Suspense
              fallback={
                <div className="h-11 w-full rounded-xl bg-background/60 border border-border/50" />
              }
            >
              <BlogSearch />
            </Suspense>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 relative z-10">
        <Suspense
          fallback={
            <div
              className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 auto-rows-fr"
              aria-hidden="true"
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-3xl border border-border bg-muted/20 overflow-hidden animate-pulse"
                >
                  <div className="aspect-16/10 w-full bg-muted/60" />
                  <div className="p-6 sm:p-7 space-y-3">
                    <div className="h-5 w-3/4 rounded-full bg-muted/70" />
                    <div className="h-3.5 w-full rounded-full bg-muted/50" />
                    <div className="h-3.5 w-2/3 rounded-full bg-muted/50" />
                  </div>
                </div>
              ))}
            </div>
          }
        >
          <BlogIndexResults>
            <BlogResults posts={posts} totalPages={totalPages} page={1} query="" />
          </BlogIndexResults>
        </Suspense>
      </main>
    </div>
  );
}
