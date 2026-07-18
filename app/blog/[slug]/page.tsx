import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Button } from '@/components/ui/button';
import { ArrowRight, Clock, Calendar } from 'lucide-react';
import type { Post } from '@/domains/blogpress/lib/definitions';
import type { Metadata } from 'next';

function estimateReadingTime(content: string | null): number {
  if (!content) return 1;
  const text = content.replace(/[#*_`~>[\\]!|-]/g, '').trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
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
    .select('name, avatar_url')
    .eq('id', p.author_id)
    .maybeSingle();
  const readingTime = estimateReadingTime(p.content);

  return (
    <article className="max-w-3xl mx-auto" aria-label={p.title}>
      <header className="mb-10">
        <Link href="/blog">
          <Button variant="ghost" size="sm" className="mb-6 -ml-2 transition-smooth">
            <ArrowRight className="ml-2 size-4" />
            العودة إلى المدونة
          </Button>
        </Link>

        {p.cover_image && (
          <div className="relative aspect-video overflow-hidden rounded-2xl mb-8 bg-muted shadow-sm">
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
                  {author.name?.[0]}
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

      <div className="prose prose-lg dark:prose-invert max-w-none prose-headings:font-bold prose-a:text-primary prose-img:rounded-xl prose-img:shadow-sm prose-code:before:content-none prose-code:after:content-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
          {p.content ?? ''}
        </ReactMarkdown>
      </div>

      <footer className="mt-16 pt-8 border-t border-border/50" role="contentinfo">
        <Link href="/blog">
          <Button variant="outline" className="transition-smooth">
            <ArrowRight className="ml-2 size-4" />
            العودة إلى المدونة
          </Button>
        </Link>
      </footer>
    </article>
  );
}
