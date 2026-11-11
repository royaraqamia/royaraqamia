import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import ReactMarkdown, { type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { LanguageFn } from 'lowlight';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import sql from 'highlight.js/lib/languages/sql';
import python from 'highlight.js/lib/languages/python';
import markdown from 'highlight.js/lib/languages/markdown';
import { User } from 'lucide-react';
import { SocialShare } from '../_components/social-share';
import { PostTableOfContents } from './_components/post-table-of-contents';
import { COMMUNITY_POST_COPY } from './community-post-copy';
import { CodeBlockEnhancer } from '../_components/code-block-enhancer';
import { PostViewTracker } from '../_components/post-view-tracker';
import { PostOwnerActions } from '../_components/post-owner-actions';
import { PostPublishedAt } from '../_components/post-published-at';
import {
  loadPublishedPostBySlug,
  loadCommunityPost,
  loadPublishedPostSlugs,
} from '@/backend/loaders/community';
import { getCanonicalOrigin } from '@/frontend/shared/constants';
import { postExcerpt } from '@/shared/reading-time';
import { markdownHeadings, remarkHeadingIds } from '@/shared/markdown/heading-ids';
import type { Metadata } from 'next';

const highlightLanguages: Record<string, LanguageFn> = {
  javascript,
  js: javascript,
  jsx: javascript,
  typescript,
  ts: typescript,
  xml,
  html: xml,
  css,
  json,
  bash,
  shell: bash,
  sh: bash,
  sql,
  python,
  py: python,
  markdown,
  md: markdown,
};

const highlightOptions = { languages: highlightLanguages, detect: false } as const;

export const revalidate = 300;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const slugs = await loadPublishedPostSlugs();
  return slugs.map((slug) => ({ slug }));
}

/** The id `remarkHeadingIds` put on the heading the body is about to draw. */
function headingElementId(node: ExtraProps['node']): string | undefined {
  const id = node?.properties?.id;
  return typeof id === 'string' ? id : undefined;
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const post = await loadPublishedPostBySlug(slug);

  if (!post) {
    return {
      title: COMMUNITY_POST_COPY.notFoundTitle,
      description: COMMUNITY_POST_COPY.notFoundBody,
    };
  }

  return {
    title: post.meta_title || postExcerpt(post.content, post.meta_desc ?? '') || 'منشور',
    description: post.meta_desc || postExcerpt(post.content),
    openGraph: post.cover_image ? { images: [{ url: post.cover_image }] } : undefined,
    twitter: post.cover_image
      ? { card: 'summary_large_image', images: [{ url: post.cover_image }] }
      : { card: 'summary' },
    alternates: {
      canonical: `/community/${post.slug}`,
    },
  };
}

export default async function CommunityPostPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const loaded = await loadCommunityPost(slug);

  if (!loaded) notFound();

  const { post: p, author, postTags } = loaded;

  const headings = markdownHeadings(p.content ?? '');
  const postUrl = `${getCanonicalOrigin()}/community/${slug}`;
  const hasHeadings = headings.length > 0;
  const excerpt = postExcerpt(p.content, p.meta_desc ?? '');

  const markdownComponents = {
    h2: (props: React.ComponentPropsWithoutRef<'h2'> & ExtraProps) => {
      const children: React.ReactNode = props.children;
      return (
        <h2
          id={headingElementId(props.node)}
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
    h3: (props: React.ComponentPropsWithoutRef<'h3'> & ExtraProps) => {
      const children: React.ReactNode = props.children;
      return (
        <h3
          id={headingElementId(props.node)}
          className="scroll-mt-28 text-xl sm:text-2xl font-bold tracking-tight text-foreground mt-8 mb-4 flex items-center gap-2 group"
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
      <PostViewTracker slug={p.slug} />
      <CodeBlockEnhancer />

      <div className="max-w-7xl mx-auto">
        <article aria-label={excerpt} data-visual="community-post">
          {/* The publisher chip; the back control lives in the sticky header. */}
          <div className="mb-8 sm:mb-10 flex flex-wrap items-center justify-between gap-x-3 gap-y-4">
            <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
              {author?.name && (
                <Link
                  href={`/u/${encodeURIComponent(author.username)}`}
                  aria-label={COMMUNITY_POST_COPY.authorProfileLabel.replace('{name}', author.name)}
                  data-visual="community-post-author"
                  className="flex items-center gap-2.5 bg-muted/30 px-3 py-1.5 rounded-full border border-border/40 hover:bg-muted/50 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
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
                  <span className="flex min-w-0 flex-col text-start">
                    <span className="font-bold text-foreground leading-tight">{author.name}</span>
                    <span className="text-[11px] text-muted-foreground leading-tight">
                      <span dir="ltr">@{author.username}</span>
                    </span>
                  </span>
                </Link>
              )}
            </div>

            <div className="flex items-center gap-2">
              <SocialShare url={postUrl} title={excerpt} />
              <PostOwnerActions post={p} />
            </div>
          </div>

          {/* Layout Grid: Article Body & Sticky Sidebar. `max-lg:`/`lg:`, never
              `grid-cols-1` + `lg:grid-cols-12`: a base utility loses the contest
              to whichever surface loaded last (ADR-0132). */}
          <div
            className={`grid max-lg:grid-cols-1 max-lg:gap-8 lg:gap-12 items-start ${
              hasHeadings ? 'lg:grid-cols-12' : 'lg:grid-cols-1 max-w-4xl mx-auto'
            }`}
          >
            <div
              id="article-body"
              className={`min-w-0 ${hasHeadings ? 'lg:col-span-8 xl:col-span-8' : 'w-full'}`}
            >
              <header className="mb-10 sm:mb-12">
                {p.cover_image && (
                  <div
                    data-visual="community-post-cover"
                    className="group relative aspect-video overflow-hidden rounded-2xl sm:rounded-3xl mb-8 sm:mb-10 bg-muted/60 border border-border/50 shadow-xl shadow-foreground/3 transition-safe duration-500 hover:shadow-2xl hover:border-border/80"
                  >
                    <Image
                      src={p.cover_image}
                      alt={excerpt}
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 75vw, 800px"
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]"
                      priority
                    />
                    <div className="absolute inset-0 ring-1 ring-inset ring-foreground/10 rounded-2xl sm:rounded-3xl pointer-events-none" />
                  </div>
                )}

                {postTags.length > 0 && (
                  <div
                    data-visual="community-post-tags"
                    className="mt-6 sm:mt-8 flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm text-muted-foreground border-y border-border/40 py-4 sm:py-4.5"
                  >
                    {postTags.map((tag) => (
                      <span
                        key={tag.id}
                        className="inline-flex items-center rounded-full bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs font-bold text-primary"
                      >
                        #{tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </header>

              {p.published_at && (
                <div className="mb-6 sm:mb-8 text-right">
                  <PostPublishedAt publishedAt={p.published_at} />
                </div>
              )}

              <div
                data-visual="community-post-body"
                className="cv-auto prose prose-lg dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-foreground prose-p:leading-relaxed prose-p:text-foreground/90 prose-p:mb-6 prose-a:text-primary prose-a:font-bold prose-a:no-underline hover:prose-a:underline prose-img:rounded-2xl prose-img:shadow-xl prose-img:border prose-img:border-border/50 prose-code:before:content-none prose-code:after:content-none prose-code:bg-muted/80 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-sm prose-code:font-mono prose-code:border prose-code:border-border/40 prose-pre:relative prose-pre:bg-muted/90 prose-pre:border prose-pre:border-border/60 prose-pre:rounded-2xl prose-pre:shadow-md prose-blockquote:border-s-primary prose-blockquote:border-s-4 prose-blockquote:bg-muted/30 prose-blockquote:py-3 prose-blockquote:px-6 prose-blockquote:rounded-e-2xl prose-blockquote:not-italic prose-blockquote:text-foreground/90 prose-hr:border-border/50"
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkHeadingIds]}
                  rehypePlugins={[[rehypeHighlight, highlightOptions]]}
                  components={markdownComponents}
                >
                  {p.content ?? ''}
                </ReactMarkdown>
              </div>
            </div>

            {/* Sticky Table of Contents Sidebar */}
            {hasHeadings && <PostTableOfContents headings={headings} />}
          </div>
        </article>
      </div>
    </>
  );
}
