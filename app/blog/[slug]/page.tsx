import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { cookies } from 'next/headers';
import { isValidElement } from 'react';
import { createClient } from '@/backend/transport/supabase/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Button } from '@/frontend/ui/ui/button';
import { ArrowRight, Clock, Calendar, BookOpen, User, ChevronLeft } from 'lucide-react';
import { ReadingProgress } from '../_components/reading-progress';
import { SocialShare } from '../_components/social-share';
import { CodeBlockEnhancer } from '../_components/code-block-enhancer';
import { estimateReadingTime, formatReadingTimeLong } from '@/frontend/shared/reading-time';
import {
  createBlogpressAdminPostsService,
  createBlogpressPostsService,
} from '@/backend/config/blogpress';
import { env } from '@/backend/config/env';
import type { Metadata } from 'next';

export const revalidate = 60;

function extractHeadings(content: string): { level: number; text: string; id: string }[] {
  const headingRegex = /^(#{1,3})\s+(.+)$/gm;
  const headings: { level: number; text: string; id: string }[] = [];
  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    const text = (match[2] ?? '').trim();
    const id = text
      .toLowerCase()
      .replace(/[^\w\s\u0600-\u06FF-]/g, '')
      .replace(/[\u060C\u061B\u061F\u0640\u066A\u066B\u066C\u066D\u06D4]/g, '')
      .replace(/\s+/g, '-');
    headings.push({ level: (match[1] ?? '').length, text, id });
  }
  return headings;
}

function flattenText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (isValidElement(node)) {
    return flattenText((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

function getHeadingId(children: React.ReactNode): string {
  return flattenText(children)
    .toLowerCase()
    .replace(/[^\w\s\u0600-\u06FF-]/g, '')
    .replace(/\s+/g, '-');
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const post = await createBlogpressPostsService(supabase).getPublishedPostBySlug(slug);

  if (!post) {
    return {
      title: 'المقال غير موجود',
      description: 'عذرًا، المقال الذي تبحث عنه غير موجود أو تمَّ حذفه.',
    };
  }

  return {
    title: post.meta_title || post.title,
    description: post.meta_desc,
    openGraph: post.cover_image ? { images: [{ url: post.cover_image }] } : undefined,
    twitter: post.cover_image
      ? { card: 'summary_large_image', images: [{ url: post.cover_image }] }
      : { card: 'summary' },
    alternates: {
      canonical: `/blog/${post.slug}`,
    },
  };
}

export default async function BlogPostPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const post = await createBlogpressPostsService(supabase).getPublishedPostBySlug(slug);

  if (!post) notFound();

  const p = post;

  const author = await createBlogpressAdminPostsService().getPostAuthor(p.author_id);

  const relatedPosts = await createBlogpressPostsService(supabase).getRelatedPosts(slug);

  const readingTime = estimateReadingTime(p.content);
  const headings = extractHeadings(p.content ?? '');
  const postUrl = `${env.siteUrl}/blog/${slug}`;
  const hasHeadings = headings.length > 0;

  const markdownComponents = {
    h2: (props: React.ComponentPropsWithoutRef<'h2'>) => {
      const children: React.ReactNode = props.children;
      return (
        <h2
          id={getHeadingId(children)}
          className="scroll-mt-28 text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-12 mb-6 pb-3 border-b border-border/40 flex items-center gap-2.5 group"
        >
          <span
            className="text-primary/40 group-hover:text-primary transition-colors duration-200 text-lg sm:text-xl font-mono select-none"
            aria-hidden="true"
          >
            #
          </span>
          <span>{children}</span>
        </h2>
      );
    },
    h3: (props: React.ComponentPropsWithoutRef<'h3'>) => {
      const children: React.ReactNode = props.children;
      return (
        <h3
          id={getHeadingId(children)}
          className="scroll-mt-28 text-xl sm:text-2xl font-semibold tracking-tight text-foreground mt-8 mb-4 flex items-center gap-2 group"
        >
          <span
            className="text-primary/30 group-hover:text-primary transition-colors duration-200 text-base sm:text-lg font-mono select-none"
            aria-hidden="true"
          >
            ##
          </span>
          <span>{children}</span>
        </h3>
      );
    },
  };

  return (
    <>
      <ReadingProgress targetId="article-body" />
      <CodeBlockEnhancer />

      <div className="max-w-7xl mx-auto">
        <article aria-label={p.title}>
          {/* Navigation Breadcrumbs */}
          <nav aria-label="مسار التَّنقُّل" className="mb-8 sm:mb-10">
            <ol className="inline-flex items-center flex-wrap gap-2 px-3.5 py-1.5 rounded-full bg-muted/40 border border-border/40 text-xs sm:text-sm text-muted-foreground backdrop-blur-md transition-all duration-300 hover:border-border/80 shadow-2xs">
              <li className="flex items-center">
                <Link
                  href="/"
                  className="hover:text-foreground font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 rounded-sm"
                >
                  الرَّئيسيَّة
                </Link>
              </li>
              {p.blog_visible && (
                <>
                  <li className="text-muted-foreground/40 select-none" aria-hidden="true">
                    <ChevronLeft className="size-3.5" />
                  </li>
                  <li className="flex items-center">
                    <Link
                      href="/blog"
                      className="hover:text-foreground font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 rounded-sm"
                    >
                      المدوَّنة
                    </Link>
                  </li>
                </>
              )}
              <li className="text-muted-foreground/40 select-none" aria-hidden="true">
                <ChevronLeft className="size-3.5" />
              </li>
              <li
                className="text-foreground font-medium truncate max-w-35 xs:max-w-[200px] sm:max-w-[320px] md:max-w-105"
                title={p.title}
              >
                {p.title}
              </li>
            </ol>
          </nav>

          {/* Layout Grid: Article Body & Sticky Sidebar */}
          <div
            className={`grid grid-cols-1 gap-8 lg:gap-12 items-start ${
              hasHeadings ? 'lg:grid-cols-12' : 'max-w-4xl mx-auto'
            }`}
          >
            <div
              id="article-body"
              className={`min-w-0 ${hasHeadings ? 'lg:col-span-8 xl:col-span-8' : 'w-full'}`}
            >
              <header className="mb-10 sm:mb-12">
                {p.cover_image && (
                  <div className="group relative aspect-video overflow-hidden rounded-2xl sm:rounded-3xl mb-8 sm:mb-10 bg-muted/60 border border-border/50 shadow-xl shadow-foreground/3 transition-all duration-500 hover:shadow-2xl hover:border-border/80">
                    <Image
                      src={p.cover_image}
                      alt={p.title}
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 75vw, 800px"
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]"
                      priority
                    />
                    <div className="absolute inset-0 ring-1 ring-inset ring-foreground/10 rounded-2xl sm:rounded-3xl pointer-events-none" />
                  </div>
                )}

                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary shadow-2xs backdrop-blur-md mb-5 transition-all duration-300 hover:bg-primary/15">
                  <BookOpen className="size-3.5" />
                  <span>مقال</span>
                </div>

                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight text-foreground text-balance">
                  {p.title}
                </h1>

                <div className="mt-6 sm:mt-8 flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm text-muted-foreground border-y border-border/40 py-4 sm:py-4.5">
                  {author?.name && (
                    <div className="flex items-center gap-2.5 bg-muted/30 px-3 py-1.5 rounded-full border border-border/40 hover:bg-muted/50 transition-colors duration-200">
                      {author.avatar_url?.trim() ? (
                        <Image
                          src={author.avatar_url}
                          alt={author.name}
                          width={28}
                          height={28}
                          className="rounded-full object-cover ring-2 ring-primary/20 shrink-0"
                        />
                      ) : (
                        <div className="size-7 rounded-full bg-primary/15 flex items-center justify-center text-primary font-medium shrink-0">
                          <User className="size-3.5" />
                        </div>
                      )}
                      <span className="font-semibold text-foreground">{author.name}</span>
                    </div>
                  )}
                  {p.published_at && (
                    <div className="flex items-center gap-1.5 bg-muted/30 px-3 py-1.5 rounded-full border border-border/40">
                      <Calendar className="size-3.5 text-primary/70 shrink-0" />
                      <span>
                        {new Intl.DateTimeFormat('ar-SA', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          calendar: 'islamic-umalqura',
                          numberingSystem: 'latn',
                        }).format(new Date(p.published_at))}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 bg-muted/30 px-3 py-1.5 rounded-full border border-border/40">
                    <Clock className="size-3.5 text-primary/70 shrink-0" />
                    <span>{formatReadingTimeLong(readingTime)}</span>
                  </div>
                </div>
              </header>

              <div className="prose prose-lg dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-foreground prose-p:leading-relaxed prose-p:text-foreground/90 prose-p:mb-6 prose-a:text-primary prose-a:font-semibold prose-a:no-underline hover:prose-a:underline prose-img:rounded-2xl prose-img:shadow-xl prose-img:border prose-img:border-border/50 prose-code:before:content-none prose-code:after:content-none prose-code:bg-muted/80 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-sm prose-code:font-mono prose-code:border prose-code:border-border/40 prose-pre:relative prose-pre:bg-muted/90 prose-pre:border prose-pre:border-border/60 prose-pre:rounded-2xl prose-pre:shadow-md prose-blockquote:border-s-primary prose-blockquote:border-s-4 prose-blockquote:bg-muted/30 prose-blockquote:py-3 prose-blockquote:px-6 prose-blockquote:rounded-e-2xl prose-blockquote:not-italic prose-blockquote:text-foreground/90 prose-hr:border-border/50">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={markdownComponents}
                >
                  {p.content ?? ''}
                </ReactMarkdown>
              </div>
            </div>

            {/* Sticky Table of Contents Sidebar */}
            {hasHeadings && (
              <aside
                className="hidden lg:block lg:col-span-4 self-start sticky top-28"
                aria-label="فهرس المحتويات"
              >
                <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl p-5 shadow-sm transition-all duration-300 hover:border-border/90 hover:shadow-md">
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/40">
                    <BookOpen className="size-4 text-primary shrink-0" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      فهرس المحتويات
                    </h4>
                  </div>
                  <nav className="space-y-1 max-h-[calc(100vh-200px)] overflow-y-auto pr-1 scrollbar-thin">
                    {headings.map((h, i) => (
                      <a
                        key={i}
                        href={`#${h.id}`}
                        className={`group flex items-center gap-2 text-xs leading-relaxed rounded-lg px-2.5 py-2 transition-all duration-200 hover:bg-primary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary ${
                          h.level === 2
                            ? 'font-medium text-foreground/85 hover:text-primary'
                            : 'text-muted-foreground/75 pr-6 hover:text-primary'
                        }`}
                      >
                        <span className="size-1.5 rounded-full bg-muted-foreground/30 group-hover:bg-primary transition-colors shrink-0" />
                        <span className="truncate">{h.text}</span>
                      </a>
                    ))}
                  </nav>
                </div>
              </aside>
            )}
          </div>

          {/* Footer Content & Actions */}
          <footer
            style={{ backgroundColor: 'transparent' }}
            className="mt-16 sm:mt-20 space-y-12 sm:space-y-16"
            role="contentinfo"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-8 border-t border-border/50">
              <Link href="/blog">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto rounded-full px-5 py-2.5 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] border-border/60 hover:bg-muted/80 shadow-2xs font-medium"
                >
                  <ArrowRight className="ms-2 size-4 text-primary" />
                  العودة إلى المدوَّنة
                </Button>
              </Link>
              <SocialShare url={postUrl} title={p.title} />
            </div>

            {/* Author Bio Card */}
            {author?.name && (
              <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-linear-to-br from-card/80 via-card to-muted/20 p-6 sm:p-8 shadow-lg shadow-foreground/2 backdrop-blur-xl">
                <div className="absolute -top-24 -right-24 size-48 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
                <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-5">
                  {author.avatar_url?.trim() ? (
                    <Image
                      src={author.avatar_url}
                      alt={author.name}
                      width={56}
                      height={56}
                      className="rounded-2xl object-cover shrink-0 ring-4 ring-primary/10 shadow-md"
                    />
                  ) : (
                    <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 ring-4 ring-primary/10 shadow-md">
                      <User className="size-6 text-primary" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base sm:text-lg font-bold text-foreground">
                        {author.name}
                      </h3>
                      <span className="px-2 py-0.5 rounded-md bg-primary/10 text-[10px] font-semibold text-primary border border-primary/20">
                        كاتب
                      </span>
                    </div>
                    {author.bio && (
                      <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 leading-relaxed max-w-2xl">
                        {author.bio}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Related Posts Grid */}
            {relatedPosts && relatedPosts.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    مقالات ذات صلة
                  </h2>
                </div>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {relatedPosts.map((rp) => (
                    <Link
                      key={rp.id}
                      href={`/blog/${rp.slug}`}
                      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card hover:bg-card/90 shadow-2xs transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      {rp.cover_image ? (
                        <div className="relative aspect-video overflow-hidden bg-muted/50">
                          <Image
                            src={rp.cover_image}
                            alt={rp.title}
                            fill
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 300px"
                            className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-linear-to-t from-background/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        </div>
                      ) : (
                        <div className="aspect-video bg-linear-to-br from-primary/15 via-primary/5 to-muted/40 flex items-center justify-center relative overflow-hidden">
                          <span className="text-3xl font-black text-primary/25 select-none">
                            {rp.title[0]}
                          </span>
                        </div>
                      )}
                      <div className="p-5 flex flex-col flex-1 justify-between">
                        <h3 className="text-sm sm:text-base font-semibold leading-snug line-clamp-2 text-foreground group-hover:text-primary transition-colors duration-200">
                          {rp.title}
                        </h3>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-4 pt-3 border-t border-border/40">
                          <Clock className="size-3.5 text-primary/60" />
                          <span>{formatReadingTimeLong(estimateReadingTime(rp.content))}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* CTA Engagement Banner */}
            <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-primary/10 via-background to-primary/5 border border-primary/20 p-8 sm:p-12 text-center shadow-xl">
              <div
                className="absolute inset-0 opacity-[0.03] pointer-events-none"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
                  backgroundSize: '40px 40px',
                }}
              />
              <div className="relative z-10">
                <div className="size-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4 shadow-2xs">
                  <BookOpen className="size-6 text-primary" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
                  هل أعجبك المقال؟
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
                  شاركه مع أصدقائك أو تصفَّح المزيد من المقالات في المدوَّنة
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
                  <Link href="/blog">
                    <Button
                      variant="outline"
                      className="rounded-full px-5 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] border-primary/30 hover:bg-primary/10 font-medium"
                    >
                      <ArrowRight className="ms-2 size-4 text-primary" />
                      جميع المقالات
                    </Button>
                  </Link>
                  <SocialShare url={postUrl} title={p.title} />
                </div>
              </div>
            </div>
          </footer>
        </article>
      </div>
    </>
  );
}
