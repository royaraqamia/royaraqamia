import Link from 'next/link';
import Image from 'next/image';
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Clock, FileText } from 'lucide-react';
import { BlogSearch } from './_components/blog-search';
import type { Post } from '@/domains/blogpress/lib/definitions';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 9;

function estimateReadingTime(content: string | null): number {
  if (!content) return 1;
  const text = content.replace(/[#*_`~>[\]!|-]/g, '').trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}

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
    .eq('status', 'published');

  if (query) {
    queryBuilder = queryBuilder.or(`title.ilike.%${query}%,meta_desc.ilike.%${query}%`);
  }

  const { data: posts, count } = await queryBuilder
    .order('published_at', { ascending: false })
    .range(from, to);

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

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
        <div className="absolute -top-24 -right-24 size-72 bg-primary/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 size-72 bg-accent-teal/10 rounded-full blur-3xl" />

        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary font-medium mb-4">
            <span className="size-1.5 rounded-full bg-primary animate-pulse" />
            المقالات
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight font-heading">المدوَّنة</h1>
          <p className="mt-2.5 text-muted-foreground text-base max-w-xl">
            أفكار، دروس، وقصص في عالم التقنية والتحول الرقمي
          </p>
          <div className="mt-6 max-w-md">
            <Suspense
              fallback={
                <div className="h-11 rounded-xl bg-background/60 border border-border/50 animate-pulse" />
              }
            >
              <BlogSearch />
            </Suspense>
          </div>
        </div>
      </div>

      {query && (
        <div className="flex items-center gap-2 mb-6 text-sm text-muted-foreground">
          <span>نتائج البحث عن:</span>
          <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary font-medium">
            &ldquo;{query}&rdquo;
          </span>
          <Link
            href="/blog"
            className="mr-auto text-xs text-primary hover:underline transition-smooth"
          >
            إلغاء التصفية
          </Link>
        </div>
      )}

      {((posts as Post[]) ?? []).length === 0 ? (
        <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-b from-muted/50 to-background py-24 px-6">
          <div className="flex flex-col items-center justify-center text-center relative z-10">
            <div className="size-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-6 shadow-sm">
              <FileText className="size-8 text-primary/60" />
            </div>
            <h2 className="text-xl font-semibold">
              {query ? 'لا توجد نتائج للبحث' : 'لا توجد مقالات بعد'}
            </h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm">
              {query
                ? 'لم نعثر على مقالات تطابق بحثك. جرّب كلمات بحث مختلفة.'
                : 'لا توجد مقالات منشورة حالياً. عد لاحقاً لقراءة أحدث المحتوى.'}
            </p>
            {query && (
              <Link href="/blog">
                <Button variant="outline" className="mt-6 rounded-xl">
                  عرض جميع المقالات
                </Button>
              </Link>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
            {(posts as Post[]).map((post, index) => (
              <article
                key={post.id}
                className="group flex flex-col rounded-2xl border border-border/50 bg-card overflow-hidden card-lift opacity-0 animate-fade-in-up"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                {post.cover_image ? (
                  <Link
                    href={`/blog/${post.slug}`}
                    className="block relative aspect-video overflow-hidden bg-muted"
                  >
                    <Image
                      src={post.cover_image}
                      alt={post.title}
                      fill
                      className="object-cover transition-smooth-slow group-hover:scale-105"
                    />
                    <div className="absolute top-3 left-3 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-background/80 backdrop-blur-sm text-[11px] text-muted-foreground font-medium">
                      <Clock className="size-3" />
                      {estimateReadingTime(post.content)} د
                    </div>
                  </Link>
                ) : (
                  <Link
                    href={`/blog/${post.slug}`}
                    className="block relative aspect-video overflow-hidden bg-gradient-to-br from-primary/10 to-primary/5"
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-5xl font-bold text-primary/20 font-heading">
                        {post.title[0]}
                      </span>
                    </div>
                    <div className="absolute top-3 left-3 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-background/80 backdrop-blur-sm text-[11px] text-muted-foreground font-medium">
                      <Clock className="size-3" />
                      {estimateReadingTime(post.content)} د
                    </div>
                  </Link>
                )}
                <div className="flex-1 flex flex-col p-5">
                  <h2 className="text-lg font-semibold leading-snug">
                    <Link
                      href={`/blog/${post.slug}`}
                      className="hover:text-primary transition-smooth"
                    >
                      {post.title}
                    </Link>
                  </h2>
                  {post.meta_desc && (
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2 leading-relaxed flex-1">
                      {post.meta_desc}
                    </p>
                  )}
                  <div className="mt-4 pt-4 border-t border-border/30 flex items-center justify-between text-xs text-muted-foreground">
                    {post.published_at && (
                      <time dateTime={post.published_at}>
                        {new Date(post.published_at).toLocaleDateString('ar', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </time>
                    )}
                    <span className="text-primary/60 group-hover:text-primary transition-smooth text-[11px] font-medium">
                      اقرأ المزيد
                      <span className="mr-1 inline-block transition-transform group-hover:translate-x-[-2px]">
                        ←
                      </span>
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-2 mt-16">
              {page > 1 && (
                <Link href={`/blog?page=${page - 1}${query ? `&q=${query}` : ''}`}>
                  <Button variant="outline" size="sm" className="rounded-full transition-smooth">
                    <ChevronRight className="size-4" />
                    السَّابق
                  </Button>
                </Link>
              )}
              {(() => {
                const pages: (number | 'ellipsis')[] = [];
                if (totalPages <= 7) {
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
                    <span key={`e${i}`} className="px-1 text-muted-foreground">
                      ...
                    </span>
                  ) : (
                    <Link key={p} href={`/blog?page=${p}${query ? `&q=${query}` : ''}`}>
                      <Button
                        variant={p === page ? 'default' : 'outline'}
                        size="sm"
                        className={`min-w-10 rounded-full transition-smooth ${
                          p === page ? 'shadow-primary' : ''
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
                  <Button variant="outline" size="sm" className="rounded-full transition-smooth">
                    التَّالي
                    <ChevronLeft className="size-4" />
                  </Button>
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
