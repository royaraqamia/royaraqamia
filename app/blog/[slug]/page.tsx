import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Button } from '@/components/ui/button';
import { ArrowRight, Clock, Calendar, BookOpen, User, ChevronLeft } from 'lucide-react';
import { ReadingProgress } from '../_components/reading-progress';
import { SocialShare } from '../_components/social-share';
import { CodeBlockEnhancer } from '../_components/code-block-enhancer';
import type { Post } from '@/domains/blogpress/lib/definitions';
import type { Metadata } from 'next';

function estimateReadingTime(content: string | null): number {
  if (!content) return 1;
  const text = content.replace(/[#*_`~>[\]!|-]/g, '').trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}

function extractHeadings(content: string): { level: number; text: string; id: string }[] {
  const headingRegex = /^(#{1,3})\s+(.+)$/gm;
  const headings: { level: number; text: string; id: string }[] = [];
  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    const text = (match[2] ?? '').trim();
    const id = text
      .toLowerCase()
      .replace(/[^\w\s\u0600-\u06FF-]/g, '')
      .replace(/\s+/g, '-');
    headings.push({ level: (match[1] ?? '').length, text, id });
  }
  return headings;
}

function flattenText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return flattenText((node as any).props.children);
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

  const { data: post } = await supabase
    .from('posts')
    .select('title, meta_title, meta_desc, cover_image, slug')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (!post) return {};

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

  const { data: post } = await supabase
    .from('posts')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (!post) notFound();

  const p = post as Post;

  const { data: author } = await supabase
    .from('users')
    .select('name, avatar_url, bio')
    .eq('id', p.author_id)
    .maybeSingle();

  const { data: relatedPosts } = await supabase
    .from('posts')
    .select('id, title, slug, cover_image, published_at, content')
    .eq('status', 'published')
    .neq('slug', slug)
    .order('published_at', { ascending: false })
    .limit(3);

  const readingTime = estimateReadingTime(p.content);
  const headings = extractHeadings(p.content ?? '');
  const postUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://royaraqamia.com'}/blog/${slug}`;
  const hasHeadings = headings.length > 0;

  const markdownComponents = {
    h2: (props: any) => {
      const children: React.ReactNode = props.children;
      return (
        <h2 id={getHeadingId(children)} className="scroll-mt-24">
          {children}
        </h2>
      );
    },
    h3: (props: any) => {
      const children: React.ReactNode = props.children;
      return (
        <h3 id={getHeadingId(children)} className="scroll-mt-24">
          {children}
        </h3>
      );
    },
  };

  return (
    <>
      <ReadingProgress />
      <CodeBlockEnhancer />

      <article className="max-w-3xl mx-auto" aria-label={p.title}>
        <nav aria-label="مسار التنقل" className="mb-8">
          <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <li>
              <Link href="/" className="hover:text-primary transition-smooth">
                الرئيسية
              </Link>
            </li>
            <li className="text-muted-foreground/40">
              <ChevronLeft className="size-3.5" />
            </li>
            <li>
              <Link href="/blog" className="hover:text-primary transition-smooth">
                المدونة
              </Link>
            </li>
            <li className="text-muted-foreground/40">
              <ChevronLeft className="size-3.5" />
            </li>
            <li className="text-foreground/60 truncate max-w-[200px]" title={p.title}>
              {p.title}
            </li>
          </ol>
        </nav>

        <header className="mb-10">
          {p.cover_image && (
            <div className="relative aspect-video overflow-hidden rounded-2xl mb-8 bg-muted shadow-sm ring-1 ring-border/50">
              <Image
                src={p.cover_image}
                alt={p.title}
                fill
                sizes="(max-width: 768px) 100vw, 768px"
                className="object-cover"
                priority
              />
            </div>
          )}

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary font-medium mb-4">
            <BookOpen className="size-3" />
            مقال
          </div>

          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl leading-tight">{p.title}</h1>

          <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {author?.name && (
              <div className="flex items-center gap-2.5">
                {author.avatar_url ? (
                  <Image
                    src={author.avatar_url}
                    alt={author.name}
                    width={28}
                    height={28}
                    className="rounded-full object-cover ring-2 ring-background"
                  />
                ) : (
                  <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-medium text-primary">
                    <User className="size-3.5" />
                  </div>
                )}
                <span className="font-medium text-foreground">{author.name}</span>
              </div>
            )}
            {p.published_at && (
              <span className="flex items-center gap-1.5">
                <Calendar className="size-3.5" />
                {new Date(p.published_at).toLocaleDateString('ar', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5" />
              {readingTime} دقائق قراءة
            </span>
          </div>
        </header>

        <div className="lg:grid lg:grid-cols-[1fr_200px] lg:gap-10">
          <div className="min-w-0">
            <div className="prose prose-lg dark:prose-invert max-w-none prose-headings:font-bold prose-a:text-primary prose-img:rounded-xl prose-img:shadow-sm prose-code:before:content-none prose-code:after:content-none prose-pre:relative prose-pre:bg-muted/80">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={markdownComponents}
              >
                {p.content ?? ''}
              </ReactMarkdown>
            </div>
          </div>

          {hasHeadings && (
            <aside className="hidden lg:block relative" aria-label="فهرس المحتويات">
              <div className="sticky top-24">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  فهرس المحتويات
                </h4>
                <nav className="space-y-1.5">
                  {headings.map((h, i) => (
                    <a
                      key={i}
                      href={`#${h.id}`}
                      className={`block text-xs leading-relaxed transition-smooth hover:text-primary ${
                        h.level === 2 ? 'text-muted-foreground/80' : 'text-muted-foreground/60 pr-3'
                      }`}
                    >
                      {h.text}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>
          )}
        </div>

        <footer className="mt-16 space-y-10" role="contentinfo">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-8 border-t border-border/50">
            <Link href="/blog">
              <Button variant="outline" className="rounded-xl transition-smooth">
                <ArrowRight className="ml-2 size-4" />
                العودة إلى المدونة
              </Button>
            </Link>
            <SocialShare url={postUrl} title={p.title} />
          </div>

          {author?.name && (
            <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-muted/50 to-background p-6">
              <div className="flex items-start gap-4">
                {author.avatar_url ? (
                  <Image
                    src={author.avatar_url}
                    alt={author.name}
                    width={48}
                    height={48}
                    className="rounded-xl object-cover shrink-0 ring-2 ring-border/50"
                  />
                ) : (
                  <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 ring-2 ring-border/50">
                    <User className="size-5 text-primary" />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">{author.name}</h3>
                  {author.bio && (
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      {author.bio}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {relatedPosts && relatedPosts.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-5">مقالات ذات صلة</h2>
              <div className="grid gap-5 sm:grid-cols-3">
                {relatedPosts.map((rp) => (
                  <Link
                    key={rp.id}
                    href={`/blog/${rp.slug}`}
                    className="group block rounded-xl border border-border/50 bg-card overflow-hidden card-lift"
                  >
                    {rp.cover_image ? (
                      <div className="relative aspect-video overflow-hidden bg-muted">
                        <Image
                          src={rp.cover_image}
                          alt={rp.title}
                          fill
                          className="object-cover transition-smooth-slow group-hover:scale-105"
                        />
                      </div>
                    ) : (
                      <div className="aspect-video bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                        <span className="text-2xl font-bold text-primary/20 font-heading">
                          {rp.title[0]}
                        </span>
                      </div>
                    )}
                    <div className="p-3.5">
                      <h3 className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-primary transition-smooth">
                        {rp.title}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {estimateReadingTime(rp.content)} دقائق قراءة
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-background border border-border/50 p-8 text-center">
            <div
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
                backgroundSize: '40px 40px',
              }}
            />
            <div className="relative z-10">
              <BookOpen className="size-8 text-primary/60 mx-auto mb-3" />
              <h2 className="text-lg font-semibold">هل أعجبك المقال؟</h2>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">
                شاركه مع أصدقائك أو تصفح المزيد من المقالات في المدونة
              </p>
              <div className="flex items-center justify-center gap-3 mt-5">
                <Link href="/blog">
                  <Button variant="outline" className="rounded-xl transition-smooth">
                    <ArrowRight className="ml-2 size-4" />
                    جميع المقالات
                  </Button>
                </Link>
                <SocialShare url={postUrl} title={p.title} />
              </div>
            </div>
          </div>
        </footer>
      </article>
    </>
  );
}
