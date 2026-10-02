import type { Metadata } from 'next';
import { Suspense } from 'react';
import { loadBlogIndex } from '@/backend/loaders/blog';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { BlogIndexResults } from './_components/blog-index-results';
import { BlogResults } from './_components/blog-results';
import { BlogSearch } from './_components/blog-search';
import { ComposeFab } from './_components/compose-fab';
import { BLOG_PAGE_SIZE } from './_components/constants';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'المجتمع',
  description: 'أفكار، دروس، وقصص في العالم الرَّقمي',
};

export default async function BlogPage() {
  const { posts, totalPages } = await loadBlogIndex(1, '', BLOG_PAGE_SIZE);

  return (
    <div className="min-h-screen text-foreground selection:bg-primary/30 selection:text-white pb-24">
      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2 sm:pt-4 relative z-10">
        <div className="text-center flex flex-col items-center mb-8 sm:mb-10 lg:mb-12">
          <SectionTitle>
            <SectionTitleHighlight>المجتمع</SectionTitleHighlight>
          </SectionTitle>
        </div>

        <Suspense
          fallback={
            <div
              className="mx-auto mb-8 h-11 w-full max-w-xl rounded-xl bg-muted/20 animate-pulse sm:mb-10"
              aria-hidden="true"
            />
          }
        >
          <div className="mx-auto mb-8 w-full max-w-xl sm:mb-10">
            <BlogSearch />
          </div>
        </Suspense>

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
      </div>

      <ComposeFab />
    </div>
  );
}
