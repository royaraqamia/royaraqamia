import Link from 'next/link';
import Image from 'next/image';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Clock, FileText } from 'lucide-react';
import type { Post } from '@/domains/blogpress/lib/definitions';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 9;

function estimateReadingTime(content: string | null): number {
  if (!content) return 1;
  const text = content.replace(/[#*_`~>[\\]!|-]/g, '').trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}

export default async function BlogPage(props: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageParam } = await props.searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const { data: posts, count } = await supabase
    .from('posts')
    .select('*', { count: 'exact' })
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .range(from, to);

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

  return (
    <div>
      <div className="mb-12">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">المدوَّنة</h1>
        <p className="mt-2.5 text-muted-foreground text-base">أفكار، دروس، وقصص</p>
      </div>

      {((posts as Post[]) ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-28 text-center">
          <div className="size-16 rounded-2xl bg-muted flex items-center justify-center mb-5">
            <FileText className="size-7 text-muted-foreground/50" />
          </div>
          <h2 className="text-lg font-semibold">لا توجد مقالات بعد</h2>
        </div>
      ) : (
        <>
          <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
            {(posts as Post[]).map((post) => (
              <article key={post.id} className="group flex flex-col">
                {post.cover_image ? (
                  <Link
                    href={`/blog/${post.slug}`}
                    className="block relative aspect-video overflow-hidden rounded-xl mb-4 bg-muted transition-smooth hover:shadow-md"
                  >
                    <Image
                      src={post.cover_image}
                      alt={post.title}
                      fill
                      className="object-cover transition-smooth-slow group-hover:scale-105"
                    />
                  </Link>
                ) : (
                  <Link
                    href={`/blog/${post.slug}`}
                    className="block relative aspect-video overflow-hidden rounded-xl mb-4 bg-linear-to-br from-primary/10 to-primary/5 transition-smooth hover:shadow-md"
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-4xl font-bold text-primary/20">{post.title[0]}</span>
                    </div>
                  </Link>
                )}
                <div className="flex-1 flex flex-col">
                  <h2 className="text-lg font-semibold leading-snug">
                    <Link
                      href={`/blog/${post.slug}`}
                      className="hover:text-primary transition-smooth"
                    >
                      {post.title}
                    </Link>
                  </h2>
                  {post.meta_desc && (
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                      {post.meta_desc}
                    </p>
                  )}
                  <div className="mt-auto pt-3.5 flex items-center gap-3 text-xs text-muted-foreground">
                    {post.published_at && (
                      <time dateTime={post.published_at}>
                        {new Date(post.published_at).toLocaleDateString('ar', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </time>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {estimateReadingTime(post.content)} دقائق قراءة
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-2 mt-16">
              {page > 1 && (
                <Link href={`/blog?page=${page - 1}`}>
                  <Button variant="outline" size="sm" className="transition-smooth">
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
                    <Link key={p} href={`/blog?page=${p}`}>
                      <Button
                        variant={p === page ? 'default' : 'outline'}
                        size="sm"
                        className="min-w-9 transition-smooth"
                      >
                        {p}
                      </Button>
                    </Link>
                  )
                );
              })()}
              {page < totalPages && (
                <Link href={`/blog?page=${page + 1}`}>
                  <Button variant="outline" size="sm" className="transition-smooth">
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
