import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Clock, FileText, ArrowLeft } from 'lucide-react';
import { BlogSearch } from './_components/blog-search';
import { estimateReadingTime, formatReadingTime } from '@/lib/reading-time';
import type { Post } from '@/domains/blogpress/lib/definitions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'المدوَّنة',
  description: 'أفكار، دروس، وقصص في العالم الرَّقمي',
};

const PAGE_SIZE = 9;

export default async function BlogPage(props: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { page: pageParam, q } = await props.searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const query = q?.trim() || '';
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  let queryBuilder = supabase
    .from('posts')
    .select('*', { count: 'exact' })
    .eq('status', 'published')
    .eq('blog_visible', true);

  if (query) {
    queryBuilder = queryBuilder.or(`title.ilike.%${query}%,meta_desc.ilike.%${query}%`);
  }

  const { data: posts, count } = await queryBuilder
    .order('published_at', { ascending: false })
    .range(from, to);

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

  return (
    <div className="pb-24">
      {/* Premium Editorial Hero Section (Borderless & Expansive) */}
      <div className="relative py-20 lg:py-32 mb-12 flex flex-col items-center text-center overflow-hidden">
        {/* Deep Ambient Background Glows */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(800px,100vw)] h-[min(800px,100vw)] bg-primary/10 blur-[120px] rounded-full pointer-events-none z-0" />

        <div className="relative z-10 w-full max-w-3xl px-4 flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/80 font-medium mb-8 backdrop-blur-md">
            <span className="size-1.5 rounded-full bg-primary animate-pulse" />
            المقالات والتحديثات
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white mb-6">
            المدوَّنة
          </h1>

          <p className="text-lg md:text-xl text-white/50 max-w-xl font-medium leading-relaxed mb-10">
            أفكار، دروس، وقصص في العالم الرَّقمي
          </p>

          <div className="w-full max-w-md relative z-20">
            <Suspense
              fallback={
                <div className="h-14 rounded-full bg-white/5 border border-white/10 animate-pulse backdrop-blur-md" />
              }
            >
              <BlogSearch />
            </Suspense>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {query && (
          <div className="flex flex-wrap items-center gap-3 mb-10 text-sm text-white/60">
            <span>نتائج البحث عن:</span>
            <span className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary font-medium">
              &ldquo;{query}&rdquo;
            </span>
            <Link
              href="/blog"
              className="me-auto text-xs text-white/40 hover:text-white transition-colors duration-300 border-b border-white/20 hover:border-white"
            >
              إلغاء التَّصفية
            </Link>
          </div>
        )}

        {((posts as Post[]) ?? []).length === 0 ? (
          /* Empty State - Minimalist Agency Style */
          <div className="relative overflow-hidden rounded-4xl border border-white/5 bg-white/2 backdrop-blur-sm py-32 px-6 flex flex-col items-center justify-center text-center">
            <div className="size-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6">
              <FileText className="size-8 text-white/40" strokeWidth={1.5} />
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight mb-3">
              {query ? 'لا توجد نتائج للبحث' : 'لا توجد مقالات بعد'}
            </h2>
            <p className="text-base text-white/50 max-w-sm mb-8 leading-relaxed">
              {query
                ? 'لم نعثر على مقالات تطابق بحثك. جرّب كلمات بحث مختلفة.'
                : 'لا توجد مقالات منشورة حالياً. عد لاحقاً لقراءة أحدث المحتوى.'}
            </p>
            {query && (
              <Link href="/blog">
                <Button
                  variant="outline"
                  className="rounded-full bg-white/5 border-white/10 hover:bg-white/10 hover:text-white transition-all duration-300"
                >
                  عرض جميع المقالات
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {(posts as Post[]).map((post, index) => (
                <article
                  key={post.id}
                  className="group/card flex flex-col rounded-4xl border border-white/5 bg-white/2 backdrop-blur-sm overflow-hidden transition-all duration-800 ease-[cubic-bezier(0.25,1,0.5,1)] hover:border-white/15 hover:-translate-y-2 hover:shadow-2xl hover:shadow-black/50 opacity-0 animate-fade-in-up"
                  style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'forwards' }}
                >
                  <Link
                    href={`/blog/${post.slug}`}
                    className="block relative aspect-16/10 overflow-hidden bg-white/5"
                  >
                    {post.cover_image ? (
                      <Image
                        src={post.cover_image}
                        alt={post.title}
                        fill
                        priority={index < 2} // Preload the first two images for perfect LCP
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw" // Crucial for performance
                        className="object-cover transition-transform duration-800 ease-[cubic-bezier(0.25,1,0.5,1)] group-hover/card:scale-105"
                      />
                    ) : (
                      // Sleek fallback if no image exists
                      <div className="absolute inset-0 bg-linear-to-br from-white/5 to-transparent flex items-center justify-center">
                        <span className="text-6xl font-bold text-white/10 uppercase tracking-tighter">
                          {post.title[0]}
                        </span>
                      </div>
                    )}

                    {/* Dark gradient overlay on hover */}
                    <div className="absolute inset-0 bg-linear-to-t from-[#0B0F19]/80 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500" />

                    {/* Time Badge - Using logical "start-4" instead of "left-3" */}
                    <div className="absolute top-4 inset-s-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-xs text-white/80 font-medium shadow-xl">
                      <Clock className="size-3.5" />
                      {formatReadingTime(estimateReadingTime(post.content))}
                    </div>
                  </Link>

                  <div className="flex-1 flex flex-col p-6 lg:p-8 relative">
                    <h2 className="text-xl font-bold leading-tight text-white/90 group-hover/card:text-white transition-colors duration-300">
                      <Link href={`/blog/${post.slug}`} className="before:absolute before:inset-0">
                        {post.title}
                      </Link>
                    </h2>

                    {post.meta_desc && (
                      <p className="mt-4 text-sm md:text-base text-white/50 line-clamp-2 leading-relaxed flex-1 font-medium">
                        {post.meta_desc}
                      </p>
                    )}

                    <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
                      {post.published_at && (
                        <time
                          dateTime={post.published_at}
                          className="text-xs font-medium text-white/40"
                        >
                          {new Intl.DateTimeFormat('ar-SA', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            calendar: 'islamic-umalqura',
                          }).format(new Date(post.published_at))}
                        </time>
                      )}

                      {/* Premium RTL-ready interactive link */}
                      <span className="inline-flex items-center gap-1.5 text-primary text-xs font-bold transition-all duration-600 ease-[cubic-bezier(0.25,1,0.5,1)]">
                        اقرأ المزيد
                        <ArrowLeft
                          className="size-3.5 transition-transform duration-500 group-hover/card:-translate-x-1 rtl:group-hover/card:translate-x-1"
                          strokeWidth={3}
                        />
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {/* Premium Pagination */}
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-center gap-2 mt-20">
                {page > 1 && (
                  <Link href={`/blog?page=${page - 1}${query ? `&q=${query}` : ''}`}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full text-white/60 hover:text-white hover:bg-white/5"
                    >
                      <ChevronRight className="size-4 rtl:rotate-180" />
                    </Button>
                  </Link>
                )}

                {(() => {
                  const pages: (number | 'ellipsis')[] = [];
                  if (totalPages <= 5) {
                    for (let i = 1; i <= totalPages; i++) pages.push(i);
                  } else {
                    pages.push(1);
                    if (page > 3) pages.push('ellipsis');
                    for (
                      let i = Math.max(2, page - 1);
                      i <= Math.min(totalPages - 1, page + 1);
                      i++
                    ) {
                      pages.push(i);
                    }
                    if (page < totalPages - 2) pages.push('ellipsis');
                    pages.push(totalPages);
                  }

                  return pages.map((p, i) =>
                    p === 'ellipsis' ? (
                      <span key={`e${i}`} className="px-2 text-white/30 text-sm tracking-widest">
                        ...
                      </span>
                    ) : (
                      <Link key={p} href={`/blog?page=${p}${query ? `&q=${query}` : ''}`}>
                        <Button
                          variant={p === page ? 'default' : 'ghost'}
                          size="sm"
                          className={`size-10 rounded-full transition-all duration-300 font-medium ${
                            p === page
                              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                              : 'text-white/60 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          {p}
                        </Button>
                      </Link>
                    )
                  );
                })()}

                {page < totalPages && (
                  <Link href={`/blog?page=${page + 1}${query ? `&q=${query}` : ''}`}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full text-white/60 hover:text-white hover:bg-white/5"
                    >
                      <ChevronLeft className="size-4 rtl:rotate-180" />
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
