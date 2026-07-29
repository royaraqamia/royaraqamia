import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  ArrowLeft,
  Search,
  Sparkles,
  X,
  Calendar,
} from 'lucide-react';
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
                <div className="h-14 w-full rounded-2xl bg-muted/30 border border-border animate-pulse backdrop-blur-xl" />
              }
            >
              <BlogSearch />
            </Suspense>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 relative z-10">
        {/* Active Search Filter Banner */}
        {query && (
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 mb-10 rounded-2xl bg-muted/20 border border-border backdrop-blur-md text-sm text-muted-foreground shadow-sm">
            <div className="flex items-center gap-2.5">
              <Search className="size-4 text-primary shrink-0" />
              <span>نتائج البحث عن:</span>
              <span className="px-3 py-1 rounded-lg bg-primary/15 border border-primary/30 text-primary font-semibold text-xs">
                &ldquo;{query}&rdquo;
              </span>
            </div>
            <Link
              href="/blog"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-200 border-b border-border hover:border-foreground pb-0.5"
            >
              <X className="size-3.5" />
              إلغاء التَّصفية
            </Link>
          </div>
        )}

        {((posts as Post[]) ?? []).length === 0 ? (
          /* Empty State Section */
          <div className="relative overflow-hidden rounded-3xl border border-border bg-muted/20 backdrop-blur-xl py-24 px-6 flex flex-col items-center justify-center text-center my-8 shadow-2xl">
            <div className="size-16 rounded-2xl bg-muted/50 border border-border flex items-center justify-center mb-6 shadow-inner text-muted-foreground">
              <FileText className="size-8 stroke-[1.5]" />
            </div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight mb-2">
              {query ? 'لا توجد نتائج للبحث' : 'لا توجد مقالات بعد'}
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-md mb-8 leading-relaxed">
              {query
                ? 'لم نعثر على مقالات تُطابق بحثك. جرِّب كلمات بحث مختلفة.'
                : 'لا توجد مقالات منشورة حاليًّا. عد لاحقًا لقراءة أحدث المحتوى والمقالات.'}
            </p>
            {query && (
              <Link href="/blog">
                <Button
                  variant="outline"
                  className="rounded-full bg-muted/50 border-border text-foreground hover:bg-muted/70 hover:border-border transition-all duration-300 px-6"
                >
                  عرض جميع المقالات
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Post Cards Grid */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 auto-rows-fr">
              {(posts as Post[]).map((post, index) => (
                <article
                  key={post.id}
                  className="group/blog relative flex flex-col justify-between rounded-3xl border border-border bg-muted/20 overflow-hidden transition-all duration-500 ease-out hover:border-border hover:bg-muted/40 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-background/60 opacity-0 animate-fade-in-up focus-within:ring-2 focus-within:ring-primary/50"
                  style={{ animationDelay: `${index * 80}ms`, animationFillMode: 'forwards' }}
                >
                  {/* Card Header & Media */}
                  <div className="relative aspect-16/10 w-full overflow-hidden bg-muted/80">
                    <Link
                      href={`/blog/${post.slug}`}
                      className="block h-full w-full focus:outline-none"
                      tabIndex={-1}
                    >
                      {post.cover_image ? (
                        <Image
                          src={post.cover_image}
                          alt={post.title}
                          fill
                          priority={index < 2}
                          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                          className="object-cover transition-transform duration-700 ease-out group-hover/blog:scale-105"
                        />
                      ) : (
                        /* Visual Fallback for missing thumbnails */
                        <div className="absolute inset-0 bg-linear-to-br from-muted via-muted/80 to-background flex flex-col items-center justify-center p-6 text-center">
                          <div className="size-14 rounded-2xl bg-muted/50 border border-border flex items-center justify-center mb-2">
                            <Sparkles className="size-6 text-foreground/30" />
                          </div>
                          <span className="text-4xl font-extrabold text-foreground/10 uppercase tracking-widest select-none">
                            {post.title[0]}
                          </span>
                        </div>
                      )}

                      {/* Dynamic Ambient Gradient Overlay */}
                      <div className="absolute inset-0 bg-linear-to-t from-background via-background/20 to-transparent opacity-60 group-hover/blog:opacity-40 transition-opacity duration-500" />
                    </Link>

                    {/* Reading Time Badge */}
                    <div className="absolute top-4 inset-s-4 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background/70 border border-border text-xs text-muted-foreground font-medium backdrop-blur-md shadow-lg pointer-events-none">
                      <Clock className="size-3.5 text-primary" />
                      <span>{formatReadingTime(estimateReadingTime(post.content))}</span>
                    </div>
                  </div>

                  {/* Card Body & Content */}
                  <div className="flex-1 flex flex-col justify-between p-6 sm:p-7 relative">
                    <div>
                      <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground group-hover/blog:text-foreground transition-colors duration-300 leading-snug line-clamp-2">
                        <Link
                          href={`/blog/${post.slug}`}
                          className="focus:outline-none before:absolute before:inset-0"
                        >
                          {post.title}
                        </Link>
                      </h2>

                      {post.meta_desc && (
                        <p className="mt-3 text-sm text-muted-foreground line-clamp-2 leading-relaxed font-normal">
                          {post.meta_desc}
                        </p>
                      )}
                    </div>

                    {/* Card Footer Meta */}
                    <div className="mt-6 pt-5 border-t border-border flex items-center justify-between text-xs relative z-20">
                      {post.published_at ? (
                        <time
                          dateTime={post.published_at}
                          className="text-muted-foreground font-medium flex items-center gap-1.5"
                        >
                          <Calendar className="size-3.5 text-muted-foreground" />
                          {new Intl.DateTimeFormat('ar-SA', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            calendar: 'islamic-umalqura',
                            numberingSystem: 'latn',
                          }).format(new Date(post.published_at))}
                        </time>
                      ) : (
                        <span />
                      )}

                      <span className="inline-flex items-center gap-1.5 text-primary text-xs font-semibold group-hover/blog:text-primary/90 transition-colors">
                        اقرأ المزيد
                        <ArrowLeft
                          className="size-3.5 transition-transform duration-300 group-hover/blog:-translate-x-1.5 rtl:group-hover/blog:translate-x-1.5"
                          strokeWidth={2.5}
                        />
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {/* Accessible Interactive Pagination Navigation */}
            {totalPages > 1 && (
              <nav
                aria-label="تنقُّل بين الصَّفحات"
                className="flex flex-wrap items-center justify-center gap-2 mt-16 sm:mt-20"
              >
                {page > 1 && (
                  <Link
                    href={`/blog?page=${page - 1}${query ? `&q=${query}` : ''}`}
                    aria-label="الصَّفحة السَّابقة"
                  >
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-10 rounded-full border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/70 hover:border-border transition-all duration-200"
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
                      <span
                        key={`e${i}`}
                        className="px-2 text-muted-foreground text-sm tracking-widest select-none"
                      >
                        ...
                      </span>
                    ) : (
                      <Link
                        key={p}
                        href={`/blog?page=${p}${query ? `&q=${query}` : ''}`}
                        aria-label={`الصَّفحة ${p}`}
                        aria-current={p === page ? 'page' : undefined}
                      >
                        <Button
                          variant={p === page ? 'default' : 'outline'}
                          size="icon"
                          className={`size-10 rounded-full transition-all duration-300 text-sm font-semibold ${
                            p === page
                              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 scale-105 border-transparent'
                              : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/70 hover:border-border'
                          }`}
                        >
                          {p}
                        </Button>
                      </Link>
                    )
                  );
                })()}

                {page < totalPages && (
                  <Link
                    href={`/blog?page=${page + 1}${query ? `&q=${query}` : ''}`}
                    aria-label="الصَّفحة التَّالية"
                  >
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-10 rounded-full border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/70 hover:border-border transition-all duration-200"
                    >
                      <ChevronLeft className="size-4 rtl:rotate-180" />
                    </Button>
                  </Link>
                )}
              </nav>
            )}
          </>
        )}
      </main>
    </div>
  );
}
