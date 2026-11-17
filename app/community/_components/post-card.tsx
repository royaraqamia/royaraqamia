'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { User } from 'lucide-react';
import { CollapsibleText } from '@/frontend/ui/shared/collapsible-text';
import { LinkifiedText } from '@/frontend/ui/shared/linkified-text';
import { PostViews } from '@/frontend/ui/shared/post-views';
import { postExcerpt, stripMarkdown } from '@/shared/reading-time';
import type { PostSummary } from '@/shared/contracts/blogpress';
import { POST_CARD_COPY } from './post-card-copy';
import { PostActionBar } from './post-action-bar';
import { PostTime } from './post-time';

interface PostCardProps {
  post: PostSummary;
  index: number;
  /** The author's own page marks a pinned post; the public feed never does. */
  showPinned?: boolean;
}

export function PostCard({ post, index, showPinned = false }: PostCardProps) {
  const [removed, setRemoved] = useState(false);
  const body = post.content?.trim() ? stripMarkdown(post.content) : (post.meta_desc ?? '');
  const label = postExcerpt(post.content, post.meta_desc ?? '');

  if (removed) return null;

  return (
    <article
      data-visual="community-card"
      className="group/community relative flex flex-col justify-between rounded-3xl border border-border bg-muted/20 overflow-hidden transition-safe duration-500 ease-out hover:border-border hover:bg-muted/40 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-background/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/50"
    >
      {post.cover_image && (
        <div className="relative aspect-16/10 w-full overflow-hidden bg-muted/80">
          <Link
            href={`/community/${post.slug}`}
            className="block h-full w-full focus:outline-none"
            tabIndex={-1}
          >
            <Image
              src={post.cover_image}
              alt={label}
              fill
              priority={index < 2}
              sizes="(max-width: 768px) 100vw, 576px"
              className="object-cover transition-transform duration-700 ease-out group-hover/community:scale-105"
            />

            <div className="absolute inset-0 bg-linear-to-t from-background via-background/20 to-transparent opacity-60 group-hover/community:opacity-40 transition-opacity duration-500" />
          </Link>
        </div>
      )}

      <div
        data-visual="community-card-content"
        className="flex-1 flex flex-col justify-between p-6 sm:p-7 relative"
      >
        <div>
          {showPinned && post.featured ? (
            <span className="relative z-20 mb-3 inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-600">
              مثبَّت
            </span>
          ) : null}
          {post.author?.name && (
            <Link
              href={`/u/${encodeURIComponent(post.author.username)}`}
              aria-label={POST_CARD_COPY.authorLink.replace('{name}', post.author.name)}
              className="relative z-20 mb-3 flex w-fit items-center gap-2.5 rounded-full transition-safe duration-150 ease-out hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              {post.author.avatar_url?.trim() ? (
                <Image
                  src={post.author.avatar_url}
                  alt={post.author.name}
                  width={28}
                  height={28}
                  className="size-7 rounded-full object-cover ring-2 ring-primary/20 shrink-0 transition-transform duration-200 hover:scale-105"
                />
              ) : (
                <div className="size-7 rounded-full bg-primary/15 flex items-center justify-center text-primary shrink-0">
                  <User className="size-3.5" />
                </div>
              )}
              <span className="flex min-w-0 flex-col text-start">
                <span className="truncate text-xs font-bold text-foreground">
                  {post.author.name}
                </span>
                <span className="truncate text-[11px] font-medium text-muted-foreground">
                  <span dir="ltr">@{post.author.username}</span>
                </span>
              </span>
            </Link>
          )}

          <Link
            href={`/community/${post.slug}`}
            aria-label={label}
            className="absolute inset-0 z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          />

          {body && (
            <CollapsibleText
              lines={4}
              className="mt-3 text-sm text-muted-foreground leading-relaxed font-normal"
              buttonClassName="relative z-20 text-primary hover:text-primary/90"
              expandLabel={POST_CARD_COPY.expand}
              collapseLabel={POST_CARD_COPY.collapse}
            >
              {/* The card is one link; a handle inside the excerpt stacks above
                  it, so the reader can follow the mention without leaving first
                  (ADR-0192). */}
              <LinkifiedText text={body} linkClassName="relative z-20" />
            </CollapsibleText>
          )}
        </div>

        <div
          data-visual="community-card-footer"
          className="-mx-6 -mb-6 mt-6 bg-muted/20 px-6 pb-2.5 pt-3 sm:-mx-7 sm:-mb-7 sm:px-7"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            {post.published_at && <PostTime iso={post.published_at} className="font-medium" />}
            {post.published_at && post.view_count > 0 && (
              <span aria-hidden="true" className="opacity-40">
                ·
              </span>
            )}
            <PostViews count={post.view_count} />
          </div>

          <PostActionBar
            post={post}
            label={label}
            editLabel={POST_CARD_COPY.editAction}
            moreLabel={POST_CARD_COPY.moreAction}
            onRemoved={() => setRemoved(true)}
            onRestored={() => setRemoved(false)}
            className="mt-1"
          />
        </div>
      </div>
    </article>
  );
}
